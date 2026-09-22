/**
 * Picks the sensor for the current mode and keeps the fusion ticking.
 * Returns an element to mount somewhere on screen (the sensor must be
 * rendered to run) and a plain-language status.
 */
import React, { useEffect, useState } from 'react';

import { sensingStatus } from '@/engine/fusion';
import { Mood } from '@/engine/spectrum';
import { useApp } from '@/store/useApp';
import { FaceSensor, FaceSensorState } from './FaceSensor';
import { LaptopSensor } from './LaptopSensor';

/** A scripted trajectory for recordings: tense → calm over ~3 minutes, then holds. */
const DEMO_PATH: Mood[] = [
  { valence: -0.55, arousal: 0.6 },
  { valence: -0.45, arousal: 0.45 },
  { valence: -0.3, arousal: 0.2 },
  { valence: -0.1, arousal: -0.05 },
  { valence: 0.15, arousal: -0.3 },
  { valence: 0.35, arousal: -0.5 },
  { valence: 0.45, arousal: -0.6 },
];

function useDemoSensor(active: boolean) {
  const demoReading = useApp((s) => s.demoReading);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const total = 180000;
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / total);
      const pos = t * (DEMO_PATH.length - 1);
      const i = Math.floor(pos);
      const a = DEMO_PATH[i];
      const b = DEMO_PATH[Math.min(DEMO_PATH.length - 1, i + 1)];
      const f = pos - i;
      // a little wobble so it looks alive
      const w = Math.sin(Date.now() / 900) * 0.04;
      demoReading({ valence: a.valence + (b.valence - a.valence) * f + w, arousal: a.arousal + (b.arousal - a.arousal) * f - w });
    }, 500);
    return () => clearInterval(id);
  }, [active, demoReading]);
}

export function useSensing() {
  const mode = useApp((s) => s.settings.sensingMode);
  const fusion = useApp((s) => s.fusion);
  const tickFusion = useApp((s) => s.tickFusion);
  const [faceState, setFaceState] = useState<FaceSensorState | null>(null);

  useDemoSensor(mode === 'demo');

  useEffect(() => {
    const id = setInterval(tickFusion, 2000);
    return () => clearInterval(id);
  }, [tickFusion]);

  let element: React.ReactElement | null = null;
  if (mode === 'face') element = <FaceSensor onState={setFaceState} />;
  else if (mode === 'laptop') element = <LaptopSensor />;

  const base = sensingStatus(fusion, Date.now());
  const status =
    mode === 'manual' ? (fusion.source === 'manual' ? 'going by what you told it (camera off)' : 'camera off, tap the map to check in')
    : mode === 'face' && faceState && !faceState.ready ? (faceState.error ? `camera page failed (${faceState.error}). Try Laptop mode or Manual in Settings.` : faceState.status)
    : base;

  return { element, status, mode, source: fusion.source, confidence: fusion.confidence, estimate: fusion.estimate };
}
