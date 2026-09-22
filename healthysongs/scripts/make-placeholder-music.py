"""
Generates eight short, original placeholder tracks so the app runs out of the box.
Each one sits at a different point on the valence/arousal spectrum, so a journey
audibly changes tempo, brightness and mode as it moves.

Replace them with real music whenever you like: drop files into assets/music/
and run  node scripts/build-manifest.js

Requires: numpy, scipy, ffmpeg on PATH.
    pip install numpy scipy
    python scripts/make-placeholder-music.py
"""
import os, subprocess, math
import numpy as np
from scipy.signal import butter, lfilter

SR = 22050
SECONDS = 42
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "music")
os.makedirs(OUT, exist_ok=True)

# name, valence(-1..1), arousal(-1..1), bpm, brightness(0..1), mode
TRACKS = [
    ("01-heavy-still",   -0.7, -0.7,  56, 0.15, "minor"),
    ("02-grey-drift",    -0.4, -0.3,  66, 0.25, "minor"),
    ("03-tense-pulse",   -0.6,  0.6, 118, 0.55, "minor"),
    ("04-restless",      -0.2,  0.3,  98, 0.45, "minor"),
    ("05-neutral-walk",   0.1,  0.0,  84, 0.40, "major"),
    ("06-soft-ground",    0.5, -0.6,  60, 0.30, "major"),
    ("07-warm-open",      0.6,  0.1,  90, 0.55, "major"),
    ("08-bright-lift",    0.8,  0.6, 124, 0.80, "major"),
]

MAJOR = [0, 4, 7, 11, 14]   # add9-ish
MINOR = [0, 3, 7, 10, 14]

def lowpass(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), btype="low")
    return lfilter(b, a, x)

def adsr(n, a, d, s, r):
    env = np.ones(n) * s
    a_n = min(int(a * SR), n // 3)
    d_n = min(int(d * SR), n // 3)
    r_n = min(int(r * SR), n // 3)
    if a_n > 0:
        env[:a_n] = np.linspace(0, 1, a_n)
    if d_n > 0:
        env[a_n:a_n + d_n] = np.linspace(1, s, d_n)
    if r_n > 0:
        env[-r_n:] = np.linspace(env[-r_n], 0, r_n)
    return env

def tone(freq, n, brightness):
    t = np.arange(n) / SR
    # a few harmonics, brightness controls how many
    x = np.sin(2 * math.pi * freq * t)
    for h, g in ((2, 0.45), (3, 0.28), (4, 0.16), (5, 0.10)):
        x += g * brightness * np.sin(2 * math.pi * freq * h * t)
    # gentle detune shimmer
    x += 0.35 * np.sin(2 * math.pi * freq * 1.004 * t)
    return x

def make(name, valence, arousal, bpm, brightness, mode):
    rng = np.random.default_rng(abs(hash(name)) % (2**32))
    n = SR * SECONDS
    out = np.zeros(n)
    root = 110.0 * (2 ** ((rng.integers(0, 5)) / 12))  # A2..C#3
    scale = MAJOR if mode == "major" else MINOR
    beat = 60.0 / bpm

    # pad: slow chord swells, one every 2 bars
    swell = beat * 8
    for start in np.arange(0, SECONDS, swell):
        length = int(min(swell * 1.2, SECONDS - start) * SR)
        if length < SR: break
        chord = [root * (2 ** (s / 12)) for s in scale[:3 + (1 if brightness > 0.5 else 0)]]
        seg = sum(tone(f, length, brightness) for f in chord) / len(chord)
        seg *= adsr(length, swell * 0.4, 0.5, 0.7, swell * 0.3)
        i = int(start * SR)
        out[i:i + length] += seg * 0.5

    # pulse: a soft plucked note on the beat, density scales with arousal
    density = 0.25 + (arousal + 1) / 2 * 0.75
    steps = int(SECONDS / (beat / 2))
    for k in range(steps):
        if rng.random() > density: continue
        t0 = k * beat / 2
        deg = scale[rng.integers(0, len(scale))] + (12 if brightness > 0.6 and rng.random() < 0.4 else 0)
        f = root * 2 * (2 ** (deg / 12))
        length = int(min(beat * 1.5, SECONDS - t0) * SR)
        if length < 1000: continue
        seg = tone(f, length, brightness * 0.8) * adsr(length, 0.01, beat * 0.4, 0.15, beat * 0.5)
        i = int(t0 * SR)
        out[i:i + length] += seg * (0.18 + 0.12 * (arousal + 1) / 2)

    # low pulse for high-arousal tracks
    if arousal > 0.2:
        for k in range(int(SECONDS / beat)):
            t0 = k * beat
            length = int(beat * 0.6 * SR)
            i = int(t0 * SR)
            if i + length > n: break
            seg = np.sin(2 * math.pi * root / 2 * np.arange(length) / SR) * adsr(length, 0.005, beat * 0.3, 0.0, 0.05)
            out[i:i + length] += seg * 0.25 * arousal

    cutoff = 600 + brightness * 5000
    out = lowpass(out, cutoff)
    # soft air for low valence
    if valence < 0:
        noise = lowpass(rng.normal(0, 1, n), 900) * 0.02 * (-valence)
        out += noise
    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.85
    # fade in/out
    f = int(SR * 2)
    out[:f] *= np.linspace(0, 1, f)
    out[-f:] *= np.linspace(1, 0, f)

    raw = os.path.join(OUT, name + ".raw")
    (out * 32767).astype(np.int16).tofile(raw)
    mp3 = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", raw,
                    "-codec:a", "libmp3lame", "-b:a", "96k", mp3], check=True)
    os.remove(raw)
    print("wrote", mp3)

if __name__ == "__main__":
    for t in TRACKS:
        make(*t)
