/**
 * Plays a journey: one track per step, in order, with a short volume ramp
 * between tracks; watches the live reading and re-plans the remaining steps
 * if the person drifts away from the path.
 *
 * It also measures what each track does (regulate.ts rule 3). If the person
 * gets clearly worse while a track plays, the track is cut short, remembered
 * as unhelpful, and the rest of the journey is re-planned from where they are
 * now, one step lighter.
 */
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Journey, replanIfDrifted } from '@/engine/planner';
import { WORSE_BY, WORSE_FOR_MS, effectOf } from '@/engine/regulate';
import { Mood, describeMood } from '@/engine/spectrum';
import { useApp } from '@/store/useApp';

export type RunnerState = {
  playing: boolean;
  positionSec: number;
  durationSec: number;
  finished: boolean;
  adjustments: number;
  /** Plain-language reason for the last change the runner made on its own. */
  lastChange: string | null;
};

export function useJourneyRunner() {
  const journey = useApp((s) => s.journey);
  const step = useApp((s) => s.journeyStep);
  const setJourneyStep = useApp((s) => s.setJourneyStep);
  const setJourney = useApp((s) => s.setJourney);
  const addLog = useApp((s) => s.addLog);
  const library = useApp((s) => s.library);
  const estimate = useApp((s) => s.fusion.estimate);
  const source = useApp((s) => s.fusion.source);
  const trackEffects = useApp((s) => s.trackEffects);
  const recordTrackEffect = useApp((s) => s.recordTrackEffect);

  const player = useRef<AudioPlayer | null>(null);
  const [state, setState] = useState<RunnerState>({ playing: false, positionSec: 0, durationSec: 0, finished: false, adjustments: 0, lastChange: null });
  const lastDriftCheck = useRef(0);
  const driftSince = useRef<number | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const liveRef = useRef<{ mood: Mood; sensed: boolean }>({ mood: estimate, sensed: source !== 'none' });
  liveRef.current = { mood: estimate, sensed: source !== 'none' };
  /** Where the person was when the current track started. */
  const trackStart = useRef<{ trackId: string; mood: Mood; at: number; sensed: boolean } | null>(null);
  const worseSince = useRef<number | null>(null);

  /** Rule 3: note what the track that's ending did, if we could see it. */
  const closeTrack = useCallback((reason: string) => {
    const t = trackStart.current;
    const j = journeyRef.current;
    trackStart.current = null;
    if (!t || !j || !t.sensed || !liveRef.current.sensed) return;
    if (Date.now() - t.at < 20000) return; // too short to say anything
    recordTrackEffect(t.trackId, effectOf(t.mood, liveRef.current.mood, j.target), { journey: j.id, reason });
  }, [recordTrackEffect]);

  const stop = useCallback(() => {
    const p = player.current;
    if (p) {
      try { p.pause(); p.remove(); } catch {}
      player.current = null;
    }
    setState((s) => ({ ...s, playing: false }));
  }, []);

  // load & play the current step
  useEffect(() => {
    if (!journey) return;
    const s = journey.steps[step];
    if (!s) return;
    let cancelled = false;

    (async () => {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      stop();
      const p = createAudioPlayer(s.track.source, { updateInterval: 500 });
      player.current = p;
      p.volume = 0;
      p.loop = false;
      p.play();
      // ramp in
      const t0 = Date.now();
      const ramp = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / 1500);
        try { p.volume = k; } catch {}
        if (k >= 1) clearInterval(ramp);
      }, 100);
      addLog({ kind: 'track', data: { journey: journey.id, step, trackId: s.track.id, title: s.track.title, point: s.point } });
      trackStart.current = { trackId: s.track.id, mood: liveRef.current.mood, at: Date.now(), sensed: liveRef.current.sensed };
      worseSince.current = null;

      const sub = p.addListener('playbackStatusUpdate', (st) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, playing: st.playing, positionSec: st.currentTime, durationSec: st.duration || prev.durationSec }));
        if (st.didJustFinish) {
          closeTrack('finished');
          const j = journeyRef.current;
          const i = stepRef.current;
          if (j && i + 1 < j.steps.length) {
            setJourneyStep(i + 1);
          } else {
            setState((prev) => ({ ...prev, finished: true, playing: false }));
            addLog({ kind: 'journey-end', data: { journey: j?.id, steps: j?.steps.length } });
          }
        }
      });
      return () => sub.remove();
    })();

    return () => { cancelled = true; };
  }, [journey?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // drift watch: every 5 s, if the reading is far from the expected point
  // for 20 s or more, re-plan the rest (only when the reading is trustworthy)
  useEffect(() => {
    if (!journey || state.finished) return;
    const now = Date.now();
    if (now - lastDriftCheck.current < 5000) return;
    lastDriftCheck.current = now;
    if (source === 'none') return;

    // Rule 3: is this track making things worse? Compare with where the
    // person was when it started; act only if it lasts, so one frown is not enough.
    const t = trackStart.current;
    if (t && t.sensed && now - t.at > 20000 && effectOf(t.mood, estimate, journey.target) > WORSE_BY) {
      if (worseSince.current === null) { worseSince.current = now; return; }
      if (now - worseSince.current >= WORSE_FOR_MS) {
        worseSince.current = null;
        const title = journey.steps[step]?.track.title;
        closeTrack('made-worse');
        const fresh = replanIfDrifted({ journey, stepIndex: step, live: estimate, library: library(), effects: trackEffects, force: true });
        const change = `You seemed to get more ${describeMood(estimate).label} during “${title}”, so it moved on to something lighter.`;
        setState((s) => ({ ...s, adjustments: s.adjustments + 1, lastChange: change }));
        addLog({ kind: 'adjust', data: { journey: journey.id, atStep: step, live: estimate, source, reason: 'made-worse', trackId: t.trackId } });
        if (fresh && step + 1 < fresh.steps.length) setJourney(fresh, step + 1);
        else { stop(); setState((s) => ({ ...s, finished: true })); }
        return;
      }
    } else {
      worseSince.current = null;
    }

    const fresh = replanIfDrifted({ journey, stepIndex: step, live: estimate, library: library(), effects: trackEffects });
    if (!fresh) { driftSince.current = null; return; }
    if (driftSince.current === null) { driftSince.current = now; return; }
    if (now - driftSince.current < 20000) return;
    driftSince.current = null;
    setJourney(fresh, step);
    setState((s) => ({ ...s, adjustments: s.adjustments + 1, lastChange: `You moved away from the path (now ${describeMood(estimate).label}), so the rest re-planned from there.` }));
    addLog({ kind: 'adjust', data: { journey: journey.id, atStep: step, live: estimate, source, reason: 'drift' } });
  }, [estimate, source, journey, step, state.finished, library, trackEffects, setJourney, addLog, closeTrack, stop]);

  useEffect(() => () => stop(), [stop]);

  const skip = useCallback(() => {
    const j = journeyRef.current;
    if (!j) return;
    closeTrack('skipped');
    if (step + 1 < j.steps.length) setJourneyStep(step + 1);
    else { stop(); setState((s) => ({ ...s, finished: true })); }
  }, [step, setJourneyStep, stop, closeTrack]);

  const togglePause = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (p.playing) p.pause(); else p.play();
  }, []);

  return { state, stop, skip, togglePause, journey: journey as Journey | null, step };
}
