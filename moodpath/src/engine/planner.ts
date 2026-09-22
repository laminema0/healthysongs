/**
 * The iso-principle planner.
 *
 * Iso-principle (Altshuler, 1948; used by MoodDJ and EmoHeal): first match the
 * person's current state, then move in small steps toward the target. This
 * planner draws a path across the spectrum from `from` to `target` and picks,
 * for each point on that path, the closest track that hasn't been played yet.
 *
 * The match is "one step lighter", and no track may pull the person further
 * from the target than they already are (see regulate.ts): matching is how
 * the music gets accepted, never a reason to feed the feeling.
 */
import { Mood, moodDistance, clampMood } from './spectrum';
import { TrackEffect, effectPenalty, helpsOrHolds, isAvoided, neverPlay, safeMeet } from './regulate';

export type Track = {
  id: string;
  title: string;
  /** Position on the spectrum. Tagged by ear, by you. */
  mood: Mood;
  /** Metro asset id (require('...mp3')) or a file uri. */
  source: number | string;
  durationSec?: number;
};

export type JourneyStep = {
  index: number;
  /** Where on the spectrum this step is meant to sit. */
  point: Mood;
  track: Track;
};

export type Journey = {
  id: string;
  startedAt: number;
  from: Mood;
  target: Mood;
  targetKey: string;
  steps: JourneyStep[];
};

/** Ease-in-out so the first step matches closely and the last steps settle. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Energy first, then feeling: when the person is far from the target in
 * arousal, the path bends so arousal moves ahead of valence. This is what the
 * literature suggests for calming (bring tempo down before warming the mood).
 */
function pathPoint(from: Mood, target: Mood, t: number): Mood {
  const te = ease(t);
  const arousalLead = Math.min(1, te * 1.35);
  return clampMood({
    valence: from.valence + (target.valence - from.valence) * te,
    arousal: from.arousal + (target.arousal - from.arousal) * arousalLead,
  });
}

export function pickNearest(point: Mood, pool: Track[], exclude: Set<string>, effects?: Record<string, TrackEffect>): Track | null {
  let best: Track | null = null;
  let bestD = Infinity;
  for (const tr of pool) {
    if (exclude.has(tr.id)) continue;
    const d = moodDistance(point, tr.mood) + effectPenalty(effects?.[tr.id]);
    if (d < bestD) { bestD = d; best = tr; }
  }
  return best;
}

/** Tracks allowed for someone at `live` heading to `target` (regulate.ts rule 2),
 *  minus the ones that have repeatedly made things worse. If nothing
 *  qualifies, fall back to the two tracks closest to the target rather than
 *  to everything. */
export function safePool(library: Track[], live: Mood, target: Mood, effects?: Record<string, TrackEffect>): Track[] {
  const ok = library.filter((t) => helpsOrHolds(t.mood, live, target) && !isAvoided(effects?.[t.id]));
  if (ok.length > 0) return ok;
  return library.filter((t) => !neverPlay(t.mood)).sort((a, b) => moodDistance(a.mood, target) - moodDistance(b.mood, target)).slice(0, 2);
}

export function planJourney(opts: {
  from: Mood; target: Mood; targetKey: string; library: Track[]; steps: number; now?: number;
  effects?: Record<string, TrackEffect>;
}): Journey {
  const { from, target, targetKey, effects } = opts;
  const library = safePool(opts.library, from, target, effects);
  const steps = Math.max(1, Math.min(opts.steps, library.length || 1));
  const start = safeMeet(from, target);
  const used = new Set<string>();
  const out: JourneyStep[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 1 : i / (steps - 1);
    const point = pathPoint(start, target, t);
    let track = pickNearest(point, library, used, effects);
    if (!track) {
      // library smaller than steps: allow repeats rather than stopping
      track = pickNearest(point, library, new Set(), effects);
    }
    if (!track) break;
    used.add(track.id);
    out.push({ index: i, point, track });
  }
  return {
    id: `j-${(opts.now ?? Date.now()).toString(36)}`,
    startedAt: opts.now ?? Date.now(),
    from, target, targetKey, steps: out,
  };
}

/**
 * Re-plan the remaining steps from a live reading if the person has drifted
 * away from where the journey expected them to be. Returns null when no
 * change is needed. `stepIndex` is the step currently playing.
 */
export function replanIfDrifted(opts: {
  journey: Journey; stepIndex: number; live: Mood; library: Track[]; threshold?: number;
  effects?: Record<string, TrackEffect>;
  /** Re-plan even if the reading is near the path (the current track made things worse). */
  force?: boolean;
}): Journey | null {
  const { journey, stepIndex, live, library, effects } = opts;
  const threshold = opts.threshold ?? 0.55;
  const expected = journey.steps[stepIndex]?.point;
  if (!expected) return null;
  if (!opts.force && moodDistance(live, expected) < threshold) return null;

  const remaining = journey.steps.length - stepIndex - 1;
  if (remaining <= 0 && !opts.force) return null;
  const played = new Set(journey.steps.slice(0, stepIndex + 1).map((s) => s.track.id));
  const fresh = planJourney({
    from: live, target: journey.target, targetKey: journey.targetKey,
    library: library.filter((t) => !played.has(t.id)), steps: opts.force ? Math.max(1, remaining) : remaining + 1, effects,
  });
  // drift: drop fresh[0] (the "match" step; the current track plays on).
  // forced: the current track is being cut, so the next one is the new match.
  const tail = (opts.force ? fresh.steps : fresh.steps.slice(1)).map((s, i) => ({ ...s, index: stepIndex + 1 + i }));
  return { ...journey, steps: [...journey.steps.slice(0, stepIndex + 1), ...tail] };
}
