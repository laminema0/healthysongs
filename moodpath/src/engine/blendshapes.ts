/**
 * Face → spectrum.
 *
 * MediaPipe's Face Landmarker returns 52 "blendshape" scores (0..1) per frame:
 * how much the face is smiling, frowning, widening the eyes, and so on. This
 * file turns those into a raw valence/arousal reading. It is a heuristic, not a
 * trained emotion classifier, and that is deliberate: the weights are readable,
 * arguable, and easy to change after testing. Write down what you change.
 *
 * The same weights are used by the in-app WebView sensor and by the optional
 * laptop server (server/read_face.py), so keep them in sync.
 */

export type Blendshapes = Record<string, number>;

export const VALENCE_WEIGHTS: Record<string, number> = {
  mouthSmileLeft: 0.7, mouthSmileRight: 0.7,
  cheekSquintLeft: 0.2, cheekSquintRight: 0.2,
  mouthDimpleLeft: 0.1, mouthDimpleRight: 0.1,
  mouthFrownLeft: -0.5, mouthFrownRight: -0.5,
  browDownLeft: -0.35, browDownRight: -0.35,
  mouthPressLeft: -0.2, mouthPressRight: -0.2,
  noseSneerLeft: -0.25, noseSneerRight: -0.25,
  mouthShrugLower: -0.2,
};

export const AROUSAL_WEIGHTS: Record<string, number> = {
  eyeWideLeft: 0.45, eyeWideRight: 0.45,
  browInnerUp: 0.5,
  browOuterUpLeft: 0.25, browOuterUpRight: 0.25,
  jawOpen: 0.6,
  mouthStretchLeft: 0.15, mouthStretchRight: 0.15,
  mouthSmileLeft: 0.15, mouthSmileRight: 0.15,
  browDownLeft: 0.15, browDownRight: 0.15, // frowning hard is also energy
  eyeBlinkLeft: -0.3, eyeBlinkRight: -0.3, // sustained closed eyes = low energy
};

export function blendshapesToRaw(b: Blendshapes): { valence: number; arousal: number } {
  let v = 0, a = 0;
  for (const k in VALENCE_WEIGHTS) v += (b[k] ?? 0) * VALENCE_WEIGHTS[k];
  for (const k in AROUSAL_WEIGHTS) a += (b[k] ?? 0) * AROUSAL_WEIGHTS[k];
  return { valence: v, arousal: a };
}

/** Serialised copy of the weights for the WebView page. */
export const WEIGHTS_JSON = JSON.stringify({ valence: VALENCE_WEIGHTS, arousal: AROUSAL_WEIGHTS });
