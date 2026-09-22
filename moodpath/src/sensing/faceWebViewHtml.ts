/**
 * The page that runs inside the WebView sensor.
 *
 * It uses MediaPipe's Face Landmarker (runs on the phone, in WebAssembly) to
 * get 52 blendshape scores per frame, turns them into a raw valence/arousal
 * reading with the same weights as src/engine/blendshapes.ts, and posts that
 * to React Native. Nothing leaves the phone except the two numbers.
 *
 * First load needs internet (≈ 8 MB of WebAssembly + model, cached after).
 */
import { WEIGHTS_JSON } from '@/engine/blendshapes';

export function faceWebViewHtml(opts: { showPreview: boolean; fps: number }) {
  const fps = Math.max(2, Math.min(15, opts.fps));
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; background: #0F1413; color: #8E9C96; font: 12px system-ui, sans-serif; overflow: hidden; }
  video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); display: block;
          ${opts.showPreview ? '' : 'opacity: 0.02; width: 2px; height: 2px;'} }
  #status { position: absolute; left: 8px; bottom: 6px; opacity: 0.8; }
</style>
</head>
<body>
<video id="v" autoplay muted playsinline></video>
<div id="status">starting…</div>
<script type="module">
  const WEIGHTS = ${WEIGHTS_JSON};
  const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const status = (t) => { document.getElementById('status').textContent = t; post({ type: 'status', text: t }); };
  const fail = (t) => { status('error: ' + t); post({ type: 'error', text: String(t) }); };
  window.addEventListener('error', (e) => fail(e.message));

  try {
    status('loading model');
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
    const { FaceLandmarker, FilesetResolver } = vision;
    const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
    const landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    status('asking for camera');
    const video = document.getElementById('v');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise((r) => (video.onloadedmetadata = r));
    await video.play();
    status('reading');
    post({ type: 'ready' });

    const interval = 1000 / ${fps};
    let last = -1;
    const loop = () => {
      const now = performance.now();
      if (now - last >= interval && video.readyState >= 2) {
        last = now;
        try {
          const res = landmarker.detectForVideo(video, now);
          const shapes = res.faceBlendshapes && res.faceBlendshapes[0];
          if (shapes) {
            const map = {};
            for (const c of shapes.categories) map[c.categoryName] = c.score;
            let v = 0, a = 0;
            for (const k in WEIGHTS.valence) v += (map[k] || 0) * WEIGHTS.valence[k];
            for (const k in WEIGHTS.arousal) a += (map[k] || 0) * WEIGHTS.arousal[k];
            post({ type: 'reading', valence: v, arousal: a, confidence: 1, at: Date.now(),
                   smile: ((map.mouthSmileLeft || 0) + (map.mouthSmileRight || 0)) / 2,
                   brow: ((map.browDownLeft || 0) + (map.browDownRight || 0)) / 2,
                   eyes: ((map.eyeWideLeft || 0) + (map.eyeWideRight || 0)) / 2 });
          } else {
            post({ type: 'reading', valence: 0, arousal: 0, confidence: 0, at: Date.now() });
          }
        } catch (e) { fail(e && e.message ? e.message : e); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } catch (e) {
    fail(e && e.message ? e.message : e);
  }
</script>
</body>
</html>`;
}
