/**
 * What should play next on Spotify, and is the song playing now helping?
 *
 * Same rules as the journeys (regulate.ts): the next song sits a step lighter
 * than you toward the target, never darker or more intense than you, and
 * songs that measurably made you worse drop down the list.
 */
import { TrackEffect, effectPenalty, helpsOrHolds, isAvoided, safeMeet } from '@/engine/regulate';
import { Mood, moodDistance } from '@/engine/spectrum';
import { playlistSongs, searchTracks } from './api';
import { Candidate, SpotifySong, SpotifyTag, ZONES, ZoneKey, zoneByKey } from './types';

/** Where a Spotify song sits, if we know: your tag first, then your zone playlists. */
export function knownMood(uri: string, tags: Record<string, SpotifyTag>, pool: Candidate[]): { mood: Mood; basis: string } | null {
  const t = tags[uri];
  if (t) return { mood: t, basis: 'you placed it' };
  const c = pool.find((p) => p.uri === uri);
  return c ? { mood: c.mood, basis: c.basis } : null;
}

/** Load the songs from your zone playlists, plus your tagged songs. */
export async function loadPool(
  playlists: Partial<Record<ZoneKey, string>>,
  tags: Record<string, SpotifyTag>,
): Promise<{ pool: Candidate[]; errors: string[] }> {
  const pool: Candidate[] = [];
  const errors: string[] = [];
  await Promise.all(Object.entries(playlists).map(async ([k, link]) => {
    if (!link?.trim()) return;
    const zone = zoneByKey(k as ZoneKey);
    try {
      for (const s of await playlistSongs(link)) pool.push({ ...s, mood: zone.mood, basis: `your ${zone.label.toLowerCase()} playlist` });
    } catch (e: any) {
      errors.push(`${zone.label}: ${e?.message ?? e}`);
    }
  }));
  // your own placements override the playlist's zone
  for (const c of pool) if (tags[c.uri]) { c.mood = tags[c.uri]; c.basis = 'you placed it'; }
  for (const [uri, t] of Object.entries(tags)) {
    if (!pool.some((c) => c.uri === uri) && t.title) {
      pool.push({ uri, title: t.title, artist: t.artist ?? '', durationMs: 0, mood: t, basis: 'you placed it' });
    }
  }
  return { pool, errors };
}

/** The point the next song should sit at: a step lighter, toward the target. */
export const nextPoint = (live: Mood, target: Mood) => safeMeet(live, target, 0.4);

export function rankCandidates(opts: {
  live: Mood; target: Mood; pool: Candidate[]; effects: Record<string, TrackEffect>; exclude: Set<string>;
}): Candidate[] {
  const { live, target, pool, effects, exclude } = opts;
  const point = nextPoint(live, target);
  return pool
    .filter((c) => !exclude.has(c.uri) && helpsOrHolds(c.mood, live, target) && !isAvoided(effects[c.uri]))
    .map((c) => ({ c, score: moodDistance(point, c.mood) + effectPenalty(effects[c.uri]) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c);
}

/** When your playlists have nothing suitable: search the zone nearest to the
 *  next point. Labelled as a guess, because a keyword isn't a feeling. */
export async function searchForPoint(live: Mood, target: Mood): Promise<Candidate[]> {
  const point = nextPoint(live, target);
  const zones = ZONES.filter((z) => z.search && helpsOrHolds(z.mood, live, target))
    .sort((a, b) => moodDistance(point, a.mood) - moodDistance(point, b.mood));
  const zone = zones[0] ?? zoneByKey('calm');
  const songs: SpotifySong[] = await searchTracks(zone.search!);
  return songs.map((s) => ({ ...s, mood: zone.mood, basis: `search “${zone.search}” (a guess)` }));
}
