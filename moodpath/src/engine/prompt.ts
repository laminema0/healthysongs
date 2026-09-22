/**
 * Spectrum point → music prompt for Jen.
 *
 * Same philosophy as blendshapes.ts: readable rules, not a black box. Every
 * word sent to the generator can be traced back to where the point sits on
 * the map. Change the rules after listening, and log what you changed.
 *
 * Musical mapping (from the music–emotion literature, simplified):
 *   arousal → tempo, density, dynamics, rhythmic drive
 *   valence → mode (minor/major), harmonic colour, register brightness
 */
import { Mood, describeMood } from './spectrum';

export type PromptParts = {
  bpm: number;
  mode: string;
  energy: string;
  instruments: string;
  texture: string;
};

export function moodToParts(m: Mood): PromptParts {
  const a = (m.arousal + 1) / 2; // 0..1
  const v = m.valence;
  const bpm = Math.round(56 + a * 72); // 56..128

  const mode =
    v < -0.45 ? 'minor key, melancholic, dark harmonies'
    : v < -0.1 ? 'minor key, reflective, bittersweet'
    : v < 0.25 ? 'modal, neutral and open, unresolved'
    : v < 0.55 ? 'major key, warm, gentle'
    : 'major key, bright, uplifting';

  const energy =
    a < 0.2 ? 'very slow, soft dynamics, lots of space and silence'
    : a < 0.42 ? 'slow, calm, soft dynamics'
    : a < 0.6 ? 'steady mid-tempo groove, moderate dynamics'
    : a < 0.8 ? 'energetic, clear rhythmic drive'
    : 'driving, intense, dense rhythm';

  const region = describeMood(m).key;
  const instruments = {
    heavy: 'solo felt piano, low cello, distant ambient pads',
    tense: 'pulsing analog synths, tight electronic drums, tense staccato strings',
    bright: 'indie pop band, bright electric guitars, handclaps, light synth lead',
    calm: 'warm acoustic guitar, soft piano, light strings, gentle brushed percussion',
    flat: 'muted electric piano, soft ambient textures, subtle tape hiss',
    restless: 'nervous arpeggiated synths, busy hi-hats, plucked bass',
    down: 'lo-fi electric piano, dusty drums, mellow bass',
    good: 'acoustic guitar, upright bass, light percussion, warm keys',
    neutral: 'electric piano, soft drums, round bass',
  }[region] ?? 'electric piano, soft drums, round bass';

  const texture =
    a < 0.35 ? 'slowly evolving, minimal, no sudden changes'
    : a > 0.7 ? 'layered and full, builds momentum'
    : 'balanced, smooth transitions';

  return { bpm, mode, energy, instruments, texture };
}

/**
 * The full prompt. `taste` is a free-text style note from Settings
 * (e.g. "with Persian setar and daf influences") appended to every prompt so
 * the journey sounds like the person, not like stock music.
 */
export function moodToPrompt(m: Mood, taste?: string): string {
  const p = moodToParts(m);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const base = `Instrumental, no vocals. ${cap(p.instruments)}. ${cap(p.mode)}. ${cap(p.energy)}, around ${p.bpm} BPM. ${cap(p.texture)}.`;
  return taste && taste.trim() ? `${base} Style: ${taste.trim()}.` : base;
}
