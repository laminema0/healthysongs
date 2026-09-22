/**
 * The few Spotify Web API calls HealthySongs needs. Paths follow the February
 * 2026 changes (playlist `/items`, search limit 10).
 *
 * Playback control (queue, play, skip) needs Spotify Premium and an active
 * device: Spotify open on the phone and something played recently.
 */
import { spotifyClientIdFrom, useApp } from '@/store/useApp';
import { refreshSpotify } from './auth';
import type { NowPlaying, SpotifySong } from './types';

const API = 'https://api.spotify.com/v1';

async function token(): Promise<string> {
  const { spotifyTokens, settings, setSpotifyTokens } = useApp.getState();
  if (!spotifyTokens) throw new Error('Not connected to Spotify.');
  if (Date.now() < spotifyTokens.expiresAt - 60000) return spotifyTokens.accessToken;
  const fresh = await refreshSpotify(spotifyClientIdFrom(settings), spotifyTokens);
  setSpotifyTokens(fresh);
  return fresh.accessToken;
}

function friendly(status: number, body: any): string {
  const reason = body?.error?.reason ?? '';
  const msg = body?.error?.message ?? '';
  if (status === 401) return 'Spotify sign-in expired. Connect again.';
  if (status === 403 && /PREMIUM/i.test(reason + msg)) return 'Controlling playback needs Spotify Premium.';
  if (status === 403) return `Spotify refused (${msg || 'forbidden'}). While the app is in Development mode, your account must be listed under Users in the Spotify dashboard.`;
  if (status === 404 && /NO_ACTIVE_DEVICE/i.test(reason + msg)) return 'No active device: open Spotify on your phone and play something first.';
  if (status === 429) return 'Spotify says slow down. Trying again shortly.';
  return `Spotify error ${status}${msg ? `: ${msg}` : ''}`;
}

async function call<T = any>(path: string, init: RequestInit = {}, retried = false): Promise<T | null> {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 && !retried) {
    // token revoked or clock skew: force a refresh once
    const s = useApp.getState();
    if (s.spotifyTokens) s.setSpotifyTokens({ ...s.spotifyTokens, expiresAt: 0 });
    return call(path, init, true);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) throw new Error(friendly(res.status, body));
  return body as T;
}

const toSong = (t: any): SpotifySong | null =>
  t && t.uri && t.type !== 'episode'
    ? { uri: t.uri, title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', '), durationMs: t.duration_ms ?? 0 }
    : null;

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const j = await call('/me/player/currently-playing');
  const song = toSong(j?.item);
  if (!song) return null;
  return { ...song, progressMs: j.progress_ms ?? 0, isPlaying: !!j.is_playing };
}

export async function getQueueUris(): Promise<string[]> {
  const j = await call('/me/player/queue');
  return (j?.queue ?? []).map((t: any) => t.uri).filter(Boolean);
}

export async function addToQueue(uri: string) {
  await call(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
}

export async function playNow(uri: string) {
  await call('/me/player/play', { method: 'PUT', body: JSON.stringify({ uris: [uri] }) });
}

export async function skipNext() {
  await call('/me/player/next', { method: 'POST' });
}

export async function searchTracks(q: string): Promise<SpotifySong[]> {
  const j = await call(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`);
  return (j?.tracks?.items ?? []).map(toSong).filter(Boolean) as SpotifySong[];
}

/** Accepts a playlist link, a spotify:playlist: URI or a bare id. Only works
 *  for playlists you own or collaborate on (Spotify rule since Feb 2026). */
export function playlistId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{10,})/) ?? s.match(/^([A-Za-z0-9]{10,})$/);
  return m ? m[1] : null;
}

export async function playlistSongs(input: string): Promise<SpotifySong[]> {
  const id = playlistId(input);
  if (!id) throw new Error(`That doesn't look like a playlist link: ${input}`);
  const out: SpotifySong[] = [];
  let path: string | null = `/playlists/${id}/items?limit=50`;
  while (path && out.length < 200) {
    const j: any = await call(path);
    for (const it of j?.items ?? []) {
      const s = toSong(it.item ?? it.track);
      if (s) out.push(s);
    }
    path = j?.next ? j.next.replace(API, '') : null;
  }
  return out;
}
