/**
 * Regulation: the rules that keep MoodPath on the person's side.
 *
 * The point of the app is a steadier state, not a louder version of the one
 * the person is already in. Matching (the iso-principle) is only a way to be
 * accepted; it must never feed the feeling. So:
 *
 *   1. Meet, one step lighter. The first track sits a little toward the
 *      target, never deeper into the feeling. Sad → tender but warmer, not
 *      sadder. Angry → strong but steadier, not more aggressive.
 *   2. Never away. A track is only a candidate if it sits closer to the
 *      target than the person does, is lighter than them when they're
 *      unpleasant, and calmer than them when they're tense. Tense (angry)
 *      and heavy (sad) tracks are never played at all.
 *   3. Watch the effect. If the person gets worse while a track plays, that
 *      track is not helping: skip it, remember it, and don't pick it again.
 *   4. Auto target. Unless the person chooses, the direction follows the
 *      state: tense → calm, heavy/down → gently brighter, flat → steadier,
 *      restless → settle. Already good → stay there.
 */
import { Mood, clampMood, describeMood, moodDistance } from './spectrum';

// Rule 4 lives next to the targets, because "Balance" is one of them.
export { autoTarget } from './spectrum';

/** Angry/tense and sad/heavy music is never the answer, however angry or sad
 *  the person is. The gentlest "match" for sadness is soft and tender (flat or
 *  calm on the map), not sad. */
export const NEVER_PLAY = ['tense', 'heavy'];
export const neverPlay = (track: Mood) => NEVER_PLAY.includes(describeMood(track).key);

const unpleasant = (m: Mood) => m.valence < -0.1;
const tense = (m: Mood) => m.valence < -0.1 && m.arousal > 0.15;

/**
 * The "match" point: where the person is, moved `lift` of the way toward the
 * target, and never darker or more intense than them.
 */
export function safeMeet(live: Mood, target: Mood, lift = 0.25): Mood {
  const p = {
    valence: live.valence + (target.valence - live.valence) * lift,
    arousal: live.arousal + (target.arousal - live.arousal) * lift,
  };
  if (unpleasant(live)) p.valence = Math.max(p.valence, live.valence + 0.1);
  if (tense(live)) p.arousal = Math.min(p.arousal, live.arousal - 0.05);
  return clampMood(p);
}

/**
 * Rule 2. Does a track at `track` help, or at least not push the person
 * further from where they're heading? Small tolerance so a close match still
 * counts.
 */
export function helpsOrHolds(track: Mood, live: Mood, target: Mood, tolerance = 0.05): boolean {
  const dTrack = moodDistance(track, target);
  const dLive = moodDistance(live, target);
  if (neverPlay(track)) return false;
  if (unpleasant(live)) {
    // in a bad place, an exact match is already too much: the song must be lighter
    if (dTrack > dLive - 0.1) return false;
    if (track.valence < live.valence + 0.15) return false;
    if (tense(live) && track.arousal > live.arousal - 0.05) return false;
    return true;
  }
  // fine or better: stay near here or closer to the target
  return dTrack <= Math.max(dLive + tolerance, 0.35);
}

/** Plain-language verdict for a track the person is hearing right now. */
export function verdict(track: Mood, live: Mood, target: Mood): { ok: boolean; text: string } {
  if (helpsOrHolds(track, live, target)) {
    return moodDistance(track, target) < moodDistance(live, target) - 0.1
      ? { ok: true, text: `helping: it sits at ${describeMood(track).label}, closer to where you're heading` }
      : { ok: true, text: `fine: it sits close to how you are, not deeper` };
  }
  const t = describeMood(track).label;
  if (neverPlay(track)) return { ok: false, text: `this one is ${t} music, which tends to deepen the feeling rather than ease it` };
  if (tense(live) && track.arousal > live.arousal) return { ok: false, text: `this one is ${t} and more intense than you are right now` };
  if (unpleasant(live) && track.valence < live.valence) return { ok: false, text: `this one is ${t}, darker than how you feel` };
  return { ok: false, text: `this one sits at ${t}, away from where you're heading` };
}

/**
 * Rule 3. How much the person moved away from the target while a track
 * played (positive = got worse). Measured as change in distance to target.
 */
export function effectOf(start: Mood, end: Mood, target: Mood): number {
  return moodDistance(end, target) - moodDistance(start, target);
}

/** How much worse before we act, and how long it has to last. */
export const WORSE_BY = 0.25;
export const WORSE_FOR_MS = 15000;

/** Tracks that made things worse before are pushed down the list, not banned
 *  outright: one bad reading can be about something else in the room. */
export type TrackEffect = { n: number; mean: number };
export function effectPenalty(e?: TrackEffect): number {
  if (!e || e.n === 0) return 0;
  const confidence = Math.min(1, e.n / 2);
  return Math.max(0, e.mean) * 1.5 * confidence;
}
export function isAvoided(e?: TrackEffect): boolean {
  return !!e && e.n >= 2 && e.mean > WORSE_BY;
}
export function recordEffect(prev: TrackEffect | undefined, delta: number): TrackEffect {
  const n = (prev?.n ?? 0) + 1;
  const mean = ((prev?.mean ?? 0) * (n - 1) + delta) / n;
  return { n, mean };
}
