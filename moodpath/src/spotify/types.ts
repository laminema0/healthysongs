/**
 * Spotify side of MoodPath: shared types and the zones of the map that
 * Spotify songs are sorted into.
 *
 * Why zones and not Spotify's own "valence/energy" numbers: Spotify switched
 * off audio-features and recommendations for new apps (Nov 2024), so a new
 * app can't ask Spotify how a song feels. Instead a song gets its place from,
 * in order of trust:
 *   1. you placed it (the "This song feels…" chips),
 *   2. it's in the playlist you linked to a zone,
 *   3. a keyword search for that zone (a guess, labelled as one).
 * On top of that, what the song actually did to you is measured and remembered.
 */
import type { Mood } from '@/engine/spectrum';

export type SpotifyTokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type ZoneKey = 'calm' | 'gentle' | 'focus' | 'warm' | 'bright' | 'steady' | 'heavy' | 'tense';

export type Zone = {
  key: ZoneKey;
  label: string;
  hint: string;
  mood: Mood;
  /** Search words used when you haven't linked a playlist. Null: never suggested. */
  search: string | null;
};

export const ZONES: Zone[] = [
  { key: 'calm', label: 'Calm', hint: 'slow, warm, settled', mood: { valence: 0.5, arousal: -0.55 }, search: 'calm acoustic' },
  { key: 'gentle', label: 'Gentle', hint: 'soft and tender, a hand on the shoulder', mood: { valence: 0.15, arousal: -0.3 }, search: 'gentle piano' },
  { key: 'focus', label: 'Focus', hint: 'steady, clear, unobtrusive', mood: { valence: 0.25, arousal: -0.05 }, search: 'lofi focus' },
  { key: 'warm', label: 'Warm lift', hint: 'gently uplifting', mood: { valence: 0.5, arousal: 0.15 }, search: 'feel good acoustic' },
  { key: 'bright', label: 'Bright', hint: 'happy, upbeat', mood: { valence: 0.7, arousal: 0.5 }, search: 'happy upbeat' },
  { key: 'steady', label: 'Steady energy', hint: 'strong but not aggressive: meets anger without feeding it', mood: { valence: 0.05, arousal: 0.4 }, search: 'uplifting instrumental energy' },
  // for tagging only, so the app knows what to keep away from
  { key: 'heavy', label: 'Sad / heavy', hint: 'only for tagging: never suggested', mood: { valence: -0.6, arousal: -0.5 }, search: null },
  { key: 'tense', label: 'Angry / tense', hint: 'only for tagging: never suggested', mood: { valence: -0.6, arousal: 0.65 }, search: null },
];

export const zoneByKey = (k: ZoneKey) => ZONES.find((z) => z.key === k)!;

/** A song you placed on the map, by URI. */
export type SpotifyTag = Mood & { title?: string; artist?: string; zone?: ZoneKey };

export type SpotifySong = { uri: string; title: string; artist: string; durationMs: number };

export type NowPlaying = SpotifySong & { progressMs: number; isPlaying: boolean };

export type Candidate = SpotifySong & { mood: Mood; basis: string };
