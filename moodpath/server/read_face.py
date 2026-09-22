"""
Laptop fallback sensor for MoodPath.

The phone posts a small JPEG (base64) every ~1.5 s; this answers with a raw
valence / arousal reading using MediaPipe's Face Landmarker blendshapes and
the SAME weights as src/engine/blendshapes.ts. Keep them in sync.

Setup (Windows PowerShell, once):
    cd server
    python -m venv .venv
    .venv\\Scripts\\activate
    pip install -r requirements.txt

Run:
    python read_face.py
    → prints the URL to paste into the app's Settings → Laptop server URL
      (phone and laptop must be on the same Wi-Fi, or use the phone's hotspot)

Nothing is stored. Frames are decoded, read, and dropped.
"""
import base64
import io
import os
import socket
import sys
import urllib.request

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image
import uvicorn

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
PORT = 8765

# --- weights: mirror of src/engine/blendshapes.ts ---------------------------
VALENCE_WEIGHTS = {
    "mouthSmileLeft": 0.7, "mouthSmileRight": 0.7,
    "cheekSquintLeft": 0.2, "cheekSquintRight": 0.2,
    "mouthDimpleLeft": 0.1, "mouthDimpleRight": 0.1,
    "mouthFrownLeft": -0.5, "mouthFrownRight": -0.5,
    "browDownLeft": -0.35, "browDownRight": -0.35,
    "mouthPressLeft": -0.2, "mouthPressRight": -0.2,
    "noseSneerLeft": -0.25, "noseSneerRight": -0.25,
    "mouthShrugLower": -0.2,
}
AROUSAL_WEIGHTS = {
    "eyeWideLeft": 0.45, "eyeWideRight": 0.45,
    "browInnerUp": 0.5,
    "browOuterUpLeft": 0.25, "browOuterUpRight": 0.25,
    "jawOpen": 0.6,
    "mouthStretchLeft": 0.15, "mouthStretchRight": 0.15,
    "mouthSmileLeft": 0.15, "mouthSmileRight": 0.15,
    "browDownLeft": 0.15, "browDownRight": 0.15,
    "eyeBlinkLeft": -0.3, "eyeBlinkRight": -0.3,
}
# ---------------------------------------------------------------------------

if not os.path.exists(MODEL_PATH):
    print("downloading face_landmarker.task (≈ 4 MB) …")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

options = vision.FaceLandmarkerOptions(
    base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
    output_face_blendshapes=True,
    output_facial_transformation_matrixes=False,
    num_faces=1,
    running_mode=vision.RunningMode.IMAGE,
)
landmarker = vision.FaceLandmarker.create_from_options(options)

app = FastAPI(title="MoodPath laptop sensor")


class Frame(BaseModel):
    image: str  # base64 JPEG


@app.post("/read")
def read(frame: Frame):
    raw = base64.b64decode(frame.image)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # front-camera photos are often rotated; MediaPipe copes with modest tilt
    arr = np.asarray(img)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=arr)
    res = landmarker.detect(mp_img)
    if not res.face_blendshapes:
        return {"present": False, "valence": 0.0, "arousal": 0.0}
    scores = {c.category_name: c.score for c in res.face_blendshapes[0]}
    v = sum(scores.get(k, 0.0) * w for k, w in VALENCE_WEIGHTS.items())
    a = sum(scores.get(k, 0.0) * w for k, w in AROUSAL_WEIGHTS.items())
    return {"present": True, "valence": float(v), "arousal": float(a)}


@app.get("/")
def health():
    return {"ok": True, "service": "moodpath-laptop-sensor"}


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    print(f"\nMoodPath laptop sensor → http://{lan_ip()}:{PORT}   (paste this into Settings → Laptop server URL)\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
