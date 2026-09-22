/**
 * The spectrum: a two-axis model of emotional state.
 *
 *   valence  -1 … +1   unpleasant → pleasant
 *   arousal  -1 … +1   low energy → high energy
 *
 * This is the valence–arousal circumplex (Russell, 1980), which is what the
 * emotion-regulation music literature (MoodDJ, EmoHeal) also works from. We
 * borrow it rather than inventing a model; see docs/01-Process-Map.docx, step 1.
 */

export type Mood = { valence: number; arousal: number };

export const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

export const clampMood = (m: Mood): Mood => ({ valence: clamp(m.valence), arousal: clamp(m.arousal) });

/** Distance on the map. Arousal is weighted a little more because tempo and
 *  energy are what people hear first when a track changes. */
export function moodDistance(a: Mood, b: Mood, arousalWeight = 1.2): number {
  const dv = a.valence - b.valence;
  const da = (a.arousal - b.arousal) * arousalWeight;
  return Math.sqrt(dv * dv + da * da);
}

export function lerpMood(a: Mood, b: Mood, t: number): Mood {
  return { valence: a.valence + (b.valence - a.valence) * t, arousal: a.arousal + (b.arousal - a.arousal) * t };
}

/** Named regions of the map, used for the words the interface uses. Order
 *  matters: the first match wins, the last entry is the fallback. */
export type Region = { key: string; label: string; test: (m: Mood) => boolean; hint: string };

export const REGIONS: Region[] = [
  { key: 'tense', label: 'tense', hint: 'high energy, unpleasant', test: (m) => m.valence < -0.2 && m.arousal > 0.2 },
  { key: 'heavy', label: 'heavy', hint: 'low energy, unpleasant', test: (m) => m.valence < -0.2 && m.arousal < -0.2 },
  { key: 'bright', label: 'bright', hint: 'high energy, pleasant', test: (m) => m.valence > 0.2 && m.arousal > 0.2 },
  { key: 'calm', label: 'calm', hint: 'low energy, pleasant', test: (m) => m.valence > 0.2 && m.arousal < -0.2 },
  { key: 'flat', label: 'flat', hint: 'low energy, in between', test: (m) => m.arousal < -0.2 },
  { key: 'restless', label: 'restless', hint: 'high energy, in between', test: (m) => m.arousal > 0.2 },
  { key: 'down', label: 'a bit down', hint: 'in between, leaning unpleasant', test: (m) => m.valence < -0.2 },
  { key: 'good', label: 'good', hint: 'in between, leaning pleasant', test: (m) => m.valence > 0.2 },
  { key: 'neutral', label: 'neutral', hint: 'somewhere in the middle', test: () => true },
];

export function describeMood(m: Mood): Region {
  return REGIONS.find((r) => r.test(m)) ?? REGIONS[REGIONS.length - 1];
}

/**
 * Where "Balance" points, by region (the app's default direction; see
 * regulate.ts for the rest of the rules). Readable on purpose; change after
 * testing and log what you changed.
 */
export function autoTarget(live: Mood): { mood: Mood; why: string } {
  switch (describeMood(live).key) {
    case 'tense':
      return { mood: { valence: 0.45, arousal: -0.45 }, why: 'you seem tense, so energy comes down first, then it gets warmer' };
    case 'restless':
      return { mood: { valence: 0.35, arousal: -0.2 }, why: 'you seem restless, so it settles the pace' };
    case 'heavy':
      return { mood: { valence: 0.5, arousal: 0.05 }, why: 'you seem low, so it lifts gently: warmer, a little more alive' };
    case 'down':
      return { mood: { valence: 0.55, arousal: 0.1 }, why: 'you seem a bit down, so it brightens gently' };
    case 'flat':
      return { mood: { valence: 0.3, arousal: 0.05 }, why: 'you seem flat, so it brings a little steady energy' };
    case 'bright':
      return { mood: { valence: Math.max(0.5, live.valence), arousal: Math.min(0.35, live.arousal) }, why: 'you seem good and lively, so it keeps you there without winding you up' };
    default:
      return { mood: { valence: Math.max(0.35, live.valence), arousal: clamp(live.arousal, -0.4, 0.2) }, why: 'you seem steady, so it keeps you there' };
  }
}

/** Where a journey can go. `relative` targets are computed from the start
 *  state (e.g. "let it out" stays near where you are, then eases slightly). */
export type Target = {
  key: string;
  label: string;
  description: string;
  resolve: (from: Mood) => Mood;
  /** Suggested number of tracks for the journey. */
  steps: number;
};

export const TARGETS: Target[] = [
  {
    key: 'balance',
    label: 'Balance',
    description: 'It chooses the direction from how you seem: tense → calmer, low → gently brighter, flat → steadier. Never deeper into the feeling.',
    resolve: (from) => autoTarget(from).mood,
    steps: 4,
  },
  {
    key: 'calm',
    label: 'Calm',
    description: 'Settle down. Energy comes down first, then it gets warmer.',
    resolve: () => ({ valence: 0.5, arousal: -0.6 }),
    steps: 4,
  },
  {
    key: 'bright',
    label: 'Bright',
    description: 'Lift up. Gently, so it doesn’t feel like being told to cheer up.',
    resolve: () => ({ valence: 0.7, arousal: 0.45 }),
    steps: 4,
  },
  {
    key: 'focus',
    label: 'Focus',
    description: 'Steady and clear. Neither sleepy nor wired.',
    resolve: () => ({ valence: 0.25, arousal: -0.05 }),
    steps: 3,
  },
  {
    key: 'letout',
    label: 'Let it out',
    description: 'Stay close to the feeling without going deeper: music just a little lighter than you, then a small step further.',
    resolve: (from) => clampMood({ valence: from.valence + 0.25, arousal: from.arousal - 0.1 }),
    steps: 3,
  },
  {
    key: 'winddown',
    label: 'Wind down',
    description: 'Toward sleep. Slow and quiet by the end.',
    resolve: () => ({ valence: 0.2, arousal: -0.9 }),
    steps: 4,
  },
];

export const targetByKey = (key: string) => TARGETS.find((t) => t.key === key) ?? TARGETS[0];
