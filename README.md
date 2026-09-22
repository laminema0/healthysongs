# MoodPath

**Music that helps you back to steady.**

MoodPath reads your facial expression through the phone's front camera, works out roughly how you feel, and chooses music that moves you toward a calmer, steadier state. If you're sad, the music gets gently brighter. If you're angry, it gets calmer. It never plays angry music to someone who is angry, or sad music to someone who is sad.

It works with its own music library, with tracks composed on the spot by the **Jen** AI music model, and alongside **Spotify** on your phone: it tells you whether the song playing is helping, suggests the next one, and can queue or play it for you.

This is a research prototype made for a 10-Day Challenge, not a finished product. Everything it senses and decides is logged, so the case study can show exactly why it did what it did.

---

## Contents

1. [The idea](#1-the-idea)
2. [What's in this repository](#2-whats-in-this-repository)
3. [How it works](#3-how-it-works)
4. [APIs and technologies](#4-apis-and-technologies)
5. [How we built it: the steps we took](#5-how-we-built-it-the-steps-we-took)
6. [Run it yourself](#6-run-it-yourself)
7. [Privacy](#7-privacy)
8. [Known limits](#8-known-limits)

---

## 1. The idea

Most mood-based music apps **match** your mood: sad person, sad playlist. That can deepen the feeling. MoodPath is built on the opposite goal: **emotional regulation**, helping you toward a stable state.

It borrows two ideas from music therapy and emotion research:

- **The valence–arousal map** (Russell's circumplex, 1980). Every feeling is a point on two axes: *valence* (unpleasant → pleasant) and *arousal* (low energy → high energy). Sad is low-energy and unpleasant, angry is high-energy and unpleasant, calm is low-energy and pleasant.
- **The iso-principle** (Altshuler, 1948). Music is accepted more easily if it starts near where you are, then moves step by step.

MoodPath uses the iso-principle carefully: the first track is close to how you feel but **always a step lighter**, never deeper into the feeling. Then each track moves further toward calm or brightness.

```
            HIGH ENERGY
                 │
   tense/angry   │   bright/happy
                 │
UNPLEASANT ──────┼────── PLEASANT
                 │
   heavy/sad     │   calm
                 │
            LOW ENERGY

 angry  ──►  steady energy  ──►  settled  ──►  calm
 sad    ──►  gentle, tender ──►  warm     ──►  gently bright
```

---

## 2. What's in this repository

| Folder | What it is |
|---|---|
| [`moodpath/`](moodpath/) | **The phone app** (iPhone and Android), built with Expo / React Native. Face sensing, the regulation engine, journeys, Jen and Spotify. It has its own detailed [README](moodpath/README.md). |
| [`web-demo/`](web-demo/) | **A live browser demo.** Uses your laptop webcam and makes music in the browser that follows the same rules. Good for showing the idea without a phone. |
| [`docs/`](docs/) | Project brief, process map, user survey, and the **AI-use log** ([`docs/ai-log.md`](docs/ai-log.md)): every AI contribution, what was changed and what was decided. |
| [`HOW-TO-RUN.md`](HOW-TO-RUN.md) | Short step-by-step instructions for Windows and VS Code. |
| `.vscode/` | One-click tasks: start the web demo, install the app, start the app, compose tracks with Jen. |

---

## 3. How it works

### The loop

```
 ┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌─────────────┐
 │  Camera  │───►│  Face → mood  │───►│  Regulation  │───►│    Music    │
 │ (on the  │    │ valence and   │    │ where to go, │    │ library, Jen│
 │  phone)  │    │ arousal       │    │ what's safe  │    │ or Spotify  │
 └──────────┘    └───────────────┘    └──────────────┘    └─────────────┘
       ▲                                                          │
       └──────── watches what each song does to you ◄─────────────┘
```

### Step 1: Sensing

- The phone runs Google's **MediaPipe Face Landmarker** inside the app (a WebView). Each frame gives 52 "blendshape" scores: how much you're smiling, frowning, raising your eyebrows, widening your eyes and so on.
- [`blendshapes.ts`](moodpath/src/engine/blendshapes.ts) turns those scores into two numbers, **valence** and **arousal**, using readable weights: smiling raises valence, frowning and brow-lowering lower it, wide eyes and an open jaw raise arousal. It's a heuristic on purpose, so you can read and argue with every weight.
- [`fusion.ts`](moodpath/src/engine/fusion.ts) smooths the signal and compares it with your **resting face** (a slow moving average over about a minute), so it works across different faces.
- **You always win.** Tapping the map to say how you feel overrides the camera for three minutes.
- Other sensing modes: *manual only*, *camera via laptop* (a Python server), and a *demo trajectory* for recordings.

### Step 2: Regulation (the core)

[`regulate.ts`](moodpath/src/engine/regulate.ts) holds the rules that keep the app on your side:

1. **Meet a step lighter.** The first track sits a little toward the goal, never deeper into the feeling.
2. **Never away.** A track only qualifies if it's closer to the goal than you are, lighter than you when you feel bad, and calmer than you when you're tense. **Angry/tense and sad/heavy music is never played.**
3. **Watch the effect.** It notes your mood when a song starts. If you get clearly worse while it plays (for 15 seconds, after the first 20), the song is cut, remembered as unhelpful and pushed down the list. A song that does this twice is never suggested again.
4. **Balance** (the default direction) chooses the goal from how you seem:

| You seem | It heads toward |
|---|---|
| tense / angry | calm (energy comes down first, then it gets warmer) |
| restless | settled |
| heavy / sad | gently brighter, a little more alive |
| a bit down | gently brighter |
| flat | a little steady energy |
| already good | stays there |

You can also pick a goal yourself: Calm, Bright, Focus, Let it out, Wind down.

### Step 3: Planning a journey

[`planner.ts`](moodpath/src/engine/planner.ts) draws a path across the map from the "step lighter" start to the goal, in 2–8 steps. **Energy moves ahead of feeling**: when calming someone down, tempo drops first, then the music warms up. For each point on the path it picks the closest safe track that hasn't been played yet. If you drift away from the path, the remaining steps re-plan from where you are, still a step lighter.

### Step 4: Music

- **Your library.** MP3 files placed on the map by ear, in the app's Library screen. The app ships with eight synthesised placeholder tracks spread across the map.
- **Jen composes what's missing.** For each step, if no library track is close enough, [`prompt.ts`](moodpath/src/engine/prompt.ts) turns that point on the map into a text prompt, and Jen composes a track for exactly that point. Arousal sets tempo (56–128 BPM), density and dynamics; valence sets key and harmonic colour; the region picks the instruments. For example:
  > *Instrumental, no vocals. Warm acoustic guitar, soft piano, light strings, gentle brushed percussion. Major key, warm, gentle. Slow, calm, soft dynamics, around 70 BPM.*

  **Music starts at once** with the closest library track. Jen composes the later steps in the background, and each one is swapped in as soon as it's ready. Composed tracks are saved on the phone and join the library.
- **Spotify.** See below.

### Step 5: With Spotify

The **Spotify** screen works alongside the Spotify app on your phone. Every 4 seconds it:

- reads which song is playing
- judges it: **helping**, **fine** or **not helping**. It knows where a song sits on the map from your own tags (*"This song feels: Calm / Gentle / … / Angry"*), from playlists you linked to each zone, or by watching your face while the song plays.
- suggests the next song, a step lighter toward the goal
- offers **Queue next** and **Play now**, plus two switches: *queue the next step on its own* and *replace songs that make it worse*
- remembers which songs helped and which made things worse

### Step 6: Logging

Readings (every 5 s), check-ins, journeys, track changes, re-plans, song effects, Jen decisions and feedback all go into a log on the phone. **Settings → Export as JSON** gives you the data for the case study.

---

## 4. APIs and technologies

### External APIs

| API | What we use it for | Where in the code |
|---|---|---|
| **Google MediaPipe Face Landmarker** (`@mediapipe/tasks-vision` 0.10.21, float16 model) | Reads 52 facial blendshapes per frame, on the phone. The model and WebAssembly are fetched from a CDN once (~8 MB), then cached. | [`faceWebViewHtml.ts`](moodpath/src/sensing/faceWebViewHtml.ts) |
| **Jen music API** (Futureverse, `app.jenmusic.ai/api/v3/public`) | Text-to-music: `POST /track/generate` with a prompt and duration, then `GET /generation_status/:id` until the track is ready, then download it (Jen deletes files after 24 h). About $0.04 per track up to 60 s. | [`jen/client.ts`](moodpath/src/jen/client.ts), [`jen/fill.ts`](moodpath/src/jen/fill.ts) |
| **Spotify Web API** | Sign-in with Authorization Code + PKCE (no client secret). Endpoints: `GET /me/player/currently-playing`, `GET /me/player/queue`, `POST /me/player/queue`, `PUT /me/player/play`, `POST /me/player/next`, `GET /search` (limit 10), `GET /playlists/{id}/items`. Follows the February 2026 API changes. | [`spotify/`](moodpath/src/spotify/) |
| **face-api.js** (`@vladmandic/face-api` 1.7.15) | Expression recognition in the web demo (neutral, happy, sad, angry, fearful, disgusted, surprised). The model is bundled, so it works offline. | [`web-demo/live.html`](web-demo/live.html) |
| **Expo / ngrok tunnel** | Lets the phone load the app from the laptop over the internet when Wi-Fi blocks direct connections. | [`metro.config.js`](moodpath/metro.config.js) |

### Why Spotify songs aren't sorted by Spotify's own mood data

Spotify switched off `audio-features` (which included valence and energy) and `recommendations` for new apps in November 2024. So MoodPath places Spotify songs using, in order of trust: **your tags**, **your zone playlists**, and **keyword search** (labelled as a guess), plus **what each song actually did to you**.

### App stack

| Part | Technology |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19, TypeScript, Expo Router |
| State and storage | Zustand, persisted with AsyncStorage |
| Audio | `expo-audio` |
| Camera and face model | `react-native-webview` running MediaPipe in a small web page |
| Spotify sign-in | `expo-web-browser` (auth session) + `expo-crypto` (PKCE, SHA-256) |
| Jen files | `expo-file-system` |
| Map | `react-native-svg` |
| Optional laptop servers | Python: FastAPI + MediaPipe ([`read_face.py`](moodpath/server/read_face.py)), Jen proxy ([`jen_proxy.py`](moodpath/server/jen_proxy.py)) |
| Web demo | Plain HTML/JS, Web Audio API for the generated music, face-api.js |

### Code map

```
moodpath/src/
  engine/spectrum.ts      the map: regions, targets, the Balance direction
  engine/regulate.ts      the safety rules: step lighter, never angry/sad music, measure effects
  engine/blendshapes.ts   face → valence/arousal (readable weights)
  engine/fusion.ts        manual > face > demo; resting-face baseline; smoothing
  engine/planner.ts       the journey path and track choice; re-planning on drift
  engine/prompt.ts        point on the map → Jen prompt
  jen/                    Jen API client; keep-or-compose decision, in the background
  spotify/                sign-in (PKCE), player/queue/search calls, suggestions
  sensing/                camera (WebView + MediaPipe), laptop sensor, demo
  audio/useJourneyRunner  plays steps, watches drift, cuts songs that make it worse
  app/                    screens: consent, Now, Journey, Summary, Library, Spotify, Settings
  store/useApp.ts         app state and the research log
```

---

## 5. How we built it: the steps we took

MoodPath was built with an AI coding assistant (Claude). Every contribution is logged in [`docs/ai-log.md`](docs/ai-log.md). In order:

1. **Brief and prior art.** Turned the kickoff discussion into a project brief and scanned prior work (hobby mood players, MoodDJ, EmoHeal, Affectiva/Cerence). Framed the gap: facial input plus a gradual-transition model, documented as a design case.
2. **Process map and survey.** A loop-per-step process with review gates, an AI-use log, and a 23-question user survey (in `docs/`).
3. **First prototype.** An Expo phone app with the valence–arousal map, an iso-principle journey planner, a face→mood heuristic using MediaPipe blendshapes, a manual check-in that always overrides the camera, a journey player, a research log export and a laptop fallback sensor.
4. **Jen for the missing tracks.** Researched the Jen API and added the keep-or-compose decision: your music where it fits, a composed track where nothing is close enough, with readable prompts built from the map.
5. **Live web demo.** A browser version with a real webcam and music that follows a match / lead / wait / re-meet rule, with a feed explaining each decision.
6. **Correcting the core idea.** On review, the app matched moods exactly (angry → angry music) and followed you down if you got worse. That's the opposite of the goal. We added the regulation rules (`regulate.ts`): meet a step lighter, never play tense or heavy tracks, the Balance direction, and measuring what each track does. The same rules went into the web demo.
7. **Spotify.** Sign-in, a verdict on the song playing now, the suggested next song, queue/play, auto-queue and replace-if-worse, adapted to Spotify's 2024 and 2026 API restrictions.
8. **Faster Jen.** Music now starts immediately from the library, while Jen composes the later steps in the background.
9. **Running it on an iPhone.** The phone couldn't reach the laptop over Wi-Fi, so we switched to Expo's tunnel (ngrok, installed in the project; an Expo account is required for tunnels). Spotify rejects `exp://` return addresses for new apps, so we added a small `https` relay page in `metro.config.js` that hands the Spotify login back to the app.
10. **Testing and polish.** Simulated journeys for angry, very angry, sad, very sad, flat and happy states (none got angry or sad music), clicked through every screen in a browser, fixed confusing labels, and updated the consent text to describe the real aim.

---

## 6. Run it yourself

You need **Node.js 20.19+**. On Windows PowerShell, use `npm.cmd` and `npx.cmd` if scripts are blocked.

### Web demo (quickest)

```bash
node web-demo/serve.js
```
Open http://localhost:8123/live.html, turn the camera on, pick a target and press Play.

### Phone app

1. Install **Expo Go** on your phone.
2. Create `moodpath/.env.local` (see [`moodpath/.env.example`](moodpath/.env.example)):
   ```
   EXPO_PUBLIC_JEN_API_KEY=your Jen key (optional)
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your Spotify app's Client ID (optional)
   ```
3. Install and start:
   ```bash
   cd moodpath
   npm install
   npx expo start
   ```
4. Scan the QR code (iPhone: Camera app; Android: inside Expo Go). Phone and laptop on the same Wi-Fi.

**If the phone can't connect** (common on iPhone): first allow **Settings → Expo Go → Local Network** on the iPhone. If it still fails, sign in with a free Expo account on both sides (`npx expo login`, and in Expo Go), then run `npx expo start --tunnel`.

### Spotify setup (optional, needs Premium to control playback)

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app** → tick **Web API**.
2. Add the **Redirect URI** that MoodPath shows under **Settings → Spotify**. With the tunnel it looks like `https://<name>.exp.direct/spotify-relay`.
3. **User Management:** add your Spotify account's email (development mode allows up to 5 users).
4. Put the **Client ID** (32 characters, not the secret) in `.env.local` or in the app's Settings.

More detail is in [`moodpath/README.md`](moodpath/README.md) and [`HOW-TO-RUN.md`](HOW-TO-RUN.md).

---

## 7. Privacy

- Camera frames are processed **on the phone** and discarded. Only two numbers (valence and arousal) are kept.
- The camera can be off entirely. Tapping the map works just as well.
- The app says what it noticed and waits for a "yes" before a journey starts ("Explain before acting", on by default).
- The research log stays on the phone until you export it.
- API keys live in `moodpath/.env.local`, which is **never committed**. For anything shared, route Jen through the proxy in `moodpath/server/jen_proxy.py` so the key stays on the laptop.

---

## 8. Known limits

- **The face reading is a heuristic,** not a trained emotion classifier. It reads expressions, not inner feelings, and works best in good light, facing the camera.
- **Spotify:** controlling playback needs Premium and an open Spotify app. New apps can only read playlists you own, can't get Spotify's mood data, and are limited to 5 users in development mode.
- **Running on your phone depends on the laptop** (Expo Go). A standalone app would need an EAS build.
- **The tunnel can drop and change its address.** The Spotify redirect address then changes too; the app always shows the current one under Settings → Spotify.
- **Sensing only runs while the app is open,** by design.
- **Not built:** voice-tone sensing and background sensing. The sensing layer is pluggable, so voice could be added as another source.

---

*MoodPath is a working name. A 10-Day Challenge prototype, built with AI assistance and documented in the AI-use log.*
