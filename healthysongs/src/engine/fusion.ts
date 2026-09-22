/**
 * Fusion: turns noisy, intermittent readings from several sources into one
 * steady estimate of where the person is on the spectrum.
 *
 * Sources, in priority order:
 *   manual   – the person tapped the map. Wins for `manualTtlMs`.
 *   face     – camera readings, baseline-corrected and smoothed.
 *   demo     – scripted trajectory for recordings and tests.
 *
 * Two smoothing constants matter:
 *   fastTauMs  – how quickly the estimate follows an expression (2–4 s feels right;
 *                shorter reacts to blinks and speech).
 *   baselineTauMs – how slowly the "resting face" reference adapts (about a minute).
 *                A face reading is always relative to that resting face, which is
 *                what makes the heuristic work across different people.
 */
import { Mood, clampMood } from './spectrum';

export type SourceKind = 'manual' | 'face' | 'demo' | 'none';

export type Reading = { valence: number; arousal: number; confidence: number; at: number };

export type FusionConfig = {
  fastTauMs: number;
  baselineTauMs: number;
  manualTtlMs: number;
  faceGain: number;
  /** Below this confidence a face reading is ignored. */
  minConfidence: number;
};

export const DEFAULT_FUSION: FusionConfig = {
  fastTauMs: 3000,
  baselineTauMs: 60000,
  manualTtlMs: 3 * 60 * 1000,
  faceGain: 2.4,
  minConfidence: 0.5,
};

export type FusionState = {
  estimate: Mood;
  source: SourceKind;
  /** 0..1, how sure we are about the estimate. */
  confidence: number;
  faceSeenAt: number | null;
  manual: { mood: Mood; at: number } | null;
  baseline: Mood | null;
  smoothed: Mood | null;
  lastRawAt: number | null;
};

export function initialFusion(): FusionState {
  return {
    estimate: { valence: 0, arousal: 0 },
    source: 'none',
    confidence: 0,
    faceSeenAt: null,
    manual: null,
    baseline: null,
    smoothed: null,
    lastRawAt: null,
  };
}

const alpha = (dtMs: number, tauMs: number) => 1 - Math.exp(-Math.max(0, dtMs) / tauMs);

export function applyManual(state: FusionState, mood: Mood, now: number): FusionState {
  const m = clampMood(mood);
  return {
    ...state,
    manual: { mood: m, at: now },
    estimate: m,
    source: 'manual',
    confidence: 1,
    // a manual check-in also re-centres the face smoothing, so the camera
    // continues from where the person said they are rather than fighting it
    smoothed: state.smoothed ? { ...m } : state.smoothed,
  };
}

export function applyFace(state: FusionState, raw: Reading, cfg: FusionConfig): FusionState {
  const now = raw.at;
  if (raw.confidence < cfg.minConfidence) {
    return { ...state, lastRawAt: now };
  }
  const dt = state.lastRawAt ? now - state.lastRawAt : 0;

  // baseline: slow EMA of the raw signal
  const baseline = state.baseline
    ? {
        valence: state.baseline.valence + (raw.valence - state.baseline.valence) * alpha(dt, cfg.baselineTauMs),
        arousal: state.baseline.arousal + (raw.arousal - state.baseline.arousal) * alpha(dt, cfg.baselineTauMs),
      }
    : { valence: raw.valence, arousal: raw.arousal };

  // deviation from resting face, scaled
  const centred: Mood = clampMood({
    valence: (raw.valence - baseline.valence) * cfg.faceGain,
    arousal: (raw.arousal - baseline.arousal) * cfg.faceGain,
  });

  // fast EMA for display / decisions
  const k = state.smoothed ? alpha(dt, cfg.fastTauMs) : 1;
  const smoothed: Mood = state.smoothed
    ? {
        valence: state.smoothed.valence + (centred.valence - state.smoothed.valence) * k,
        arousal: state.smoothed.arousal + (centred.arousal - state.smoothed.arousal) * k,
      }
    : centred;

  const manualFresh = state.manual && now - state.manual.at < cfg.manualTtlMs;
  return {
    ...state,
    baseline,
    smoothed,
    lastRawAt: now,
    faceSeenAt: now,
    estimate: manualFresh ? state.manual!.mood : smoothed,
    source: manualFresh ? 'manual' : 'face',
    confidence: manualFresh ? 1 : raw.confidence,
  };
}

export function applyDemo(state: FusionState, mood: Mood, now: number): FusionState {
  return { ...state, estimate: clampMood(mood), source: 'demo', confidence: 1, lastRawAt: now };
}

/** Called on a timer so a stale manual check-in expires even with no camera. */
export function tick(state: FusionState, now: number, cfg: FusionConfig): FusionState {
  const manualFresh = state.manual && now - state.manual.at < cfg.manualTtlMs;
  if (state.source === 'manual' && !manualFresh) {
    if (state.smoothed && state.faceSeenAt && now - state.faceSeenAt < 10000) {
      return { ...state, estimate: state.smoothed, source: 'face', confidence: 0.6 };
    }
    return { ...state, source: 'none', confidence: 0.3 };
  }
  return state;
}

/** Plain-language status for the interface. */
export function sensingStatus(state: FusionState, now: number): string {
  if (state.source === 'manual') return 'going by what you told it';
  if (state.source === 'demo') return 'demo trajectory';
  if (state.faceSeenAt && now - state.faceSeenAt < 4000) return 'reading your face';
  if (state.faceSeenAt) return 'lost your face, holding the last reading';
  return 'not sensing yet';
}
