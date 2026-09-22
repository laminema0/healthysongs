/**
 * The selection decision: for each step of a planned journey, keep the
 * library track or ask Jen to compose one for that exact point on the map.
 *
 *   library  – never call Jen.
 *   mixed    – use a library track when it sits close enough to the step's
 *              point (distance < gapThreshold); otherwise compose. This is the
 *              default: your own music where it fits, Jen fills the gaps.
 *   jen      – compose every step.
 *
 * Each decision is recorded (kept / composed, distance, prompt) so the case
 * study can show exactly why a track was chosen.
 *
 * Speed: the journey doesn't wait for Jen. The first step always plays from
 * the library straight away (`fromStep: 1`), and each later step is swapped
 * in the moment Jen finishes it (`onStepReady`), while earlier tracks play.
 */
import { Journey, Track } from '@/engine/planner';
import { moodToPrompt } from '@/engine/prompt';
import { moodDistance } from '@/engine/spectrum';
import { JenConfig, jenMakeTrack } from './client';

export type MusicSource = 'library' | 'mixed' | 'jen';

export type JenTrack = Track & { source: string; prompt: string; createdAt: number; jenId: string };

export type StepDecision = {
  step: number;
  action: 'kept' | 'composed' | 'fallback';
  distance: number;
  trackId: string;
  prompt?: string;
  error?: string;
};

export type FillProgress = { total: number; done: number; composing: number; note: string };

export async function fillJourneyWithJen(opts: {
  journey: Journey;
  mode: MusicSource;
  cfg: JenConfig;
  gapThreshold: number;
  durationSec: number;
  taste?: string;
  onProgress?: (p: FillProgress) => void;
  /** Steps before this index keep their library track (they play first, no waiting). */
  fromStep?: number;
  /** Called as soon as each composed track is on the phone. */
  onStepReady?: (index: number, track: JenTrack) => void;
}): Promise<{ journey: Journey; decisions: StepDecision[]; created: JenTrack[] }> {
  const { journey, mode, cfg, gapThreshold, durationSec, taste, onProgress, onStepReady } = opts;
  const fromStep = opts.fromStep ?? 0;

  const decisions: StepDecision[] = journey.steps.map((s) => {
    const distance = moodDistance(s.point, s.track.mood);
    const compose = s.index >= fromStep && (mode === 'jen' || (mode === 'mixed' && distance >= gapThreshold));
    return { step: s.index, action: compose ? 'composed' : 'kept', distance, trackId: s.track.id };
  });

  const toCompose = decisions.filter((d) => d.action === 'composed');
  if (mode === 'library' || toCompose.length === 0 || !cfg.apiKey && !cfg.proxyUrl) {
    return {
      journey,
      decisions: decisions.map((d) => (d.action === 'composed' ? { ...d, action: 'fallback', error: 'no Jen key' } : d)),
      created: [],
    };
  }

  let done = 0;
  const report = (note: string) => onProgress?.({ total: toCompose.length, done, composing: toCompose.length - done, note });
  report(`Jen is composing ${toCompose.length} track${toCompose.length > 1 ? 's' : ''}`);

  const created: JenTrack[] = [];
  const steps = [...journey.steps];

  // all in parallel: journeys are ≤ 8 steps, Jen allows 10 concurrent
  await Promise.all(toCompose.map(async (d) => {
    const step = steps[d.step];
    const prompt = moodToPrompt(step.point, taste);
    d.prompt = prompt;
    try {
      const { id, uri } = await jenMakeTrack(cfg, prompt, durationSec, (s) => report(`step ${d.step + 1}: ${s}`));
      const t: JenTrack = {
        id: `jen-${id}`, jenId: id, title: `Jen · ${step.index + 1}`, source: uri, mood: step.point,
        prompt, createdAt: Date.now(), durationSec,
      };
      created.push(t);
      steps[d.step] = { ...step, track: t };
      d.trackId = t.id;
      onStepReady?.(d.step, t);
    } catch (e: any) {
      d.action = 'fallback';
      d.error = e?.message ?? String(e);
    } finally {
      done++;
      report(`${done} of ${toCompose.length} ready`);
    }
  }));

  return { journey: { ...journey, steps }, decisions, created };
}
