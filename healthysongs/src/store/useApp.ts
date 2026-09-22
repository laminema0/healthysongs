/**
 * App state. One zustand store, persisted to AsyncStorage.
 *
 * Everything the case study will need later is logged here: readings,
 * check-ins, journeys, adjustments, feedback. Export it from Settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_FUSION, FusionConfig, FusionState, Reading, applyDemo, applyFace, applyManual, initialFusion, tick } from '@/engine/fusion';
import { Journey, Track } from '@/engine/planner';
import { TrackEffect, recordEffect } from '@/engine/regulate';
import { Mood } from '@/engine/spectrum';
import { MANIFEST } from '@/library/manifest';
import type { JenTrack, MusicSource } from '@/jen/fill';
import type { SpotifyTag, SpotifyTokens, ZoneKey } from '@/spotify/types';

export type SensingMode = 'face' | 'manual' | 'laptop' | 'demo';

export type Settings = {
  sensingMode: SensingMode;
  showCameraPreview: boolean;
  /** Tell the person what was noticed before the music moves. */
  explainBeforeActing: boolean;
  laptopUrl: string;
  fusion: FusionConfig;
  stepsOverride: number | null;
  /** Where journey tracks come from. */
  musicSource: MusicSource;
  jenApiKey: string;
  /** Optional: route Jen calls through server/jen_proxy.py so the key stays on the laptop. */
  jenProxyUrl: string;
  /** Free-text style note appended to every Jen prompt. */
  jenTaste: string;
  jenDurationSec: number;
  /** In mixed mode, compose when the nearest library track is at least this far from the step's point. */
  gapThreshold: number;
  /** Spotify app Client ID (public with PKCE). Overrides EXPO_PUBLIC_SPOTIFY_CLIENT_ID. */
  spotifyClientId: string;
  /** Optional: one of your own playlists per zone, so suggestions come from music you chose. */
  spotifyPlaylists: Partial<Record<ZoneKey, string>>;
  /** Put the suggestion in the Spotify queue on its own, near the end of each song. */
  spotifyAutoQueue: boolean;
  /** Skip a song on its own when you get clearly worse while it plays. */
  spotifySkipWorse: boolean;
};

export type LogEvent = {
  at: number;
  kind: 'reading' | 'checkin' | 'journey-start' | 'track' | 'adjust' | 'feedback' | 'journey-end' | 'note' | 'selection' | 'effect' | 'spotify';
  data: Record<string, unknown>;
};

type TagOverride = { valence: number; arousal: number; tagged: boolean };

type AppState = {
  consentGiven: boolean;
  settings: Settings;
  fusion: FusionState;
  tagOverrides: Record<string, TagOverride>;
  hiddenTracks: Record<string, boolean>;
  journey: Journey | null;
  journeyStep: number;
  log: LogEvent[];
  lastReadingLoggedAt: number;
  /** Tracks Jen composed. They join the library, so the library grows with use. */
  jenTracks: JenTrack[];
  /** What each track did to the person, measured (regulate.ts rule 3). Keyed by track id or Spotify URI. */
  trackEffects: Record<string, TrackEffect>;
  spotifyTokens: SpotifyTokens | null;
  /** Where the person placed Spotify songs on the map, by URI. */
  spotifyTags: Record<string, SpotifyTag>;

  // actions
  setConsent: (v: boolean) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateFusionConfig: (patch: Partial<FusionConfig>) => void;
  faceReading: (r: Reading) => void;
  manualCheckIn: (m: Mood) => void;
  demoReading: (m: Mood) => void;
  tickFusion: () => void;
  resetFusion: () => void;
  setTrackMood: (id: string, mood: Mood) => void;
  setTrackHidden: (id: string, hidden: boolean) => void;
  setJourney: (j: Journey | null, step?: number) => void;
  setJourneyStep: (i: number) => void;
  /** Swap in a track Jen just composed, if that step hasn't started and wasn't re-planned. */
  patchJourneyStep: (journeyId: string, index: number, point: Mood, track: Track) => boolean;
  /** What Jen is doing in the background, for the Journey screen. */
  jenStatus: string | null;
  setJenStatus: (s: string | null) => void;
  addLog: (e: Omit<LogEvent, 'at'>) => void;
  clearLog: () => void;
  addJenTracks: (t: JenTrack[]) => void;
  removeJenTrack: (id: string) => void;
  clearJenTracks: () => void;
  library: () => Track[];
  recordTrackEffect: (id: string, delta: number, context?: Record<string, unknown>) => void;
  setSpotifyTokens: (t: SpotifyTokens | null) => void;
  tagSpotify: (uri: string, tag: SpotifyTag) => void;
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      consentGiven: false,
      settings: {
        sensingMode: 'face',
        showCameraPreview: false,
        explainBeforeActing: true,
        laptopUrl: 'http://192.168.0.10:8765',
        fusion: DEFAULT_FUSION,
        stepsOverride: null,
        musicSource: 'mixed',
        jenApiKey: '',
        jenProxyUrl: '',
        jenTaste: '',
        jenDurationSec: 60,
        gapThreshold: 0.35,
        spotifyClientId: '',
        spotifyPlaylists: {},
        spotifyAutoQueue: false,
        spotifySkipWorse: false,
      },
      fusion: initialFusion(),
      tagOverrides: {},
      hiddenTracks: {},
      journey: null,
      journeyStep: 0,
      log: [],
      lastReadingLoggedAt: 0,
      jenTracks: [],
      trackEffects: {},
      spotifyTokens: null,
      spotifyTags: {},

      setConsent: (v) => set({ consentGiven: v }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateFusionConfig: (patch) => set((s) => ({ settings: { ...s.settings, fusion: { ...s.settings.fusion, ...patch } } })),

      faceReading: (r) => {
        const s = get();
        const next = applyFace(s.fusion, r, s.settings.fusion);
        // log one reading every 5 s at most; the case study doesn't need 10 Hz
        const shouldLog = r.at - s.lastReadingLoggedAt > 5000 && r.confidence >= s.settings.fusion.minConfidence;
        set({
          fusion: next,
          ...(shouldLog
            ? {
                lastReadingLoggedAt: r.at,
                log: [...s.log, { at: r.at, kind: 'reading' as const, data: { source: 'face', ...next.estimate, confidence: r.confidence } }].slice(-2000),
              }
            : {}),
        });
      },
      manualCheckIn: (m) => {
        const now = Date.now();
        set((s) => ({
          fusion: applyManual(s.fusion, m, now),
          log: [...s.log, { at: now, kind: 'checkin' as const, data: { ...m } }].slice(-2000),
        }));
      },
      demoReading: (m) => set((s) => ({ fusion: applyDemo(s.fusion, m, Date.now()) })),
      tickFusion: () => set((s) => {
        const next = tick(s.fusion, Date.now(), s.settings.fusion);
        return next === s.fusion ? {} : { fusion: next };
      }),
      resetFusion: () => set({ fusion: initialFusion() }),

      setTrackMood: (id, mood) => set((s) => ({ tagOverrides: { ...s.tagOverrides, [id]: { ...mood, tagged: true } } })),
      setTrackHidden: (id, hidden) => set((s) => ({ hiddenTracks: { ...s.hiddenTracks, [id]: hidden } })),

      setJourney: (j, step = 0) => set({ journey: j, journeyStep: step }),
      setJourneyStep: (i) => set({ journeyStep: i }),
      patchJourneyStep: (journeyId, index, point, track) => {
        const { journey, journeyStep } = get();
        const step = journey?.steps[index];
        if (!journey || journey.id !== journeyId || !step || index <= journeyStep) return false;
        if (step.point.valence !== point.valence || step.point.arousal !== point.arousal) return false; // re-planned since
        const steps = journey.steps.map((s, i) => (i === index ? { ...s, track } : s));
        set({ journey: { ...journey, steps } });
        return true;
      },
      jenStatus: null,
      setJenStatus: (s) => set({ jenStatus: s }),
      addLog: (e) => set((s) => ({ log: [...s.log, { at: Date.now(), ...e }].slice(-2000) })),
      clearLog: () => set({ log: [] }),
      addJenTracks: (t) => set((s) => ({ jenTracks: [...s.jenTracks, ...t] })),
      removeJenTrack: (id) => set((s) => ({ jenTracks: s.jenTracks.filter((t) => t.id !== id) })),
      clearJenTracks: () => set({ jenTracks: [] }),

      recordTrackEffect: (id, delta, context) => set((s) => {
        const next = recordEffect(s.trackEffects[id], delta);
        return {
          trackEffects: { ...s.trackEffects, [id]: next },
          log: [...s.log, { at: Date.now(), kind: 'effect' as const, data: { id, delta, ...next, ...context } }].slice(-2000),
        };
      }),
      setSpotifyTokens: (t) => set({ spotifyTokens: t }),
      tagSpotify: (uri, tag) => set((s) => ({ spotifyTags: { ...s.spotifyTags, [uri]: tag } })),

      library: () => {
        const { tagOverrides, hiddenTracks, jenTracks } = get();
        const files = MANIFEST.filter((t) => !hiddenTracks[t.id]).map((t) => {
          const o = tagOverrides[t.id];
          return { id: t.id, title: t.title, source: t.source, mood: o ? { valence: o.valence, arousal: o.arousal } : t.mood };
        });
        const composed = jenTracks.filter((t) => !hiddenTracks[t.id]).map((t) => {
          const o = tagOverrides[t.id];
          return { ...t, mood: o ? { valence: o.valence, arousal: o.arousal } : t.mood };
        });
        return [...files, ...composed];
      },
    }),
    {
      name: 'healthysongs-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // fusion state and the active journey are session-only
      partialize: (s) => ({
        consentGiven: s.consentGiven,
        settings: s.settings,
        tagOverrides: s.tagOverrides,
        hiddenTracks: s.hiddenTracks,
        log: s.log,
        jenTracks: s.jenTracks,
        trackEffects: s.trackEffects,
        spotifyTokens: s.spotifyTokens,
        spotifyTags: s.spotifyTags,
      }),
      // older saved settings don't have the Jen fields; fill them from defaults
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        settings: { ...current.settings, ...(persisted?.settings ?? {}) },
      }),
    },
  ),
);

/** Is a track tagged (either in the manifest or by the person)? */
export function isTagged(id: string, overrides: Record<string, TagOverride>): boolean {
  if (id.startsWith('jen-')) return true; // composed for a point, so already placed
  if (overrides[id]) return overrides[id].tagged;
  return MANIFEST.find((t) => t.id === id)?.tagged ?? false;
}

/** Key typed in Settings wins; otherwise the one from .env.local. */
export function jenConfigFrom(settings: Settings) {
  const apiKey = settings.jenApiKey.trim() || (process.env.EXPO_PUBLIC_JEN_API_KEY ?? '').trim();
  return { apiKey, proxyUrl: settings.jenProxyUrl.trim() || null };
}

export function jenAvailable(settings: Settings) {
  const c = jenConfigFrom(settings);
  return !!(c.apiKey || c.proxyUrl);
}

/** Client ID typed in Settings wins; otherwise the one from .env.local. */
export function spotifyClientIdFrom(settings: Settings) {
  return settings.spotifyClientId.trim() || (process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '').trim();
}

/** Spotify Client IDs are 32 hex characters. Anything else (a secret, a token,
 *  another service's key) makes Spotify's sign-in page say INVALID_CLIENT. */
export function spotifyClientIdProblem(id: string): string | null {
  if (!id) return null;
  if (/^[0-9a-f]{32}$/i.test(id)) return null;
  return `This doesn't look like a Spotify Client ID (${id.slice(0, 5)}…). A Client ID is 32 letters and numbers, no prefix. Find it at developer.spotify.com → Dashboard → your app → Settings → Basic Information. Never use the Client secret here.`;
}
