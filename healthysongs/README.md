# HealthySongs

Music that meets you where you are, then moves you somewhere else.

A prototype for the **10-Day Challenge**: the phone reads your facial expression (on the phone, nothing leaves it), places you on a valence/arousal map, and plays a short journey of tracks that first *matches* how you feel and then carries you toward calm, bright, focus, "let it out" or wind-down. That match-then-move rule is the **iso-principle** from the music-therapy literature; the map is the **valence–arousal circumplex**. See `../docs/` for the brief, the process map and the survey.

**The aim is a steadier state, never a stronger version of a bad one.** If you're sad, the music gets a bit happier. If you're angry, it gets calmer. It never plays angry music to someone angry or sad music to someone sad. Matching only means the first song is close enough to be accepted, and even that song is a step lighter than you. The rules are in `src/engine/regulate.ts` (see §6).

This is a research prototype, not a product. Everything it senses and decides is logged so the case study can show it.

---

## 1. Run it (Windows, first time)

You need **Node.js 20+** (https://nodejs.org) and the **Expo Go** app on your phone (App Store / Play Store).

```powershell
cd path\to\music\healthysongs
npm install
npx expo start
```

Scan the QR code with Expo Go (Android: inside Expo Go; iPhone: with the camera app). Phone and laptop must be on the same Wi-Fi. If the QR won't connect, run `npx expo start --tunnel`.

> OneDrive note: `node_modules` is ~500 MB of small files. If OneDrive slows down, either pause OneDrive sync for this folder or copy the `healthysongs` folder somewhere outside OneDrive (e.g. `C:\dev\healthysongs`) before `npm install`.

The app ships with eight **placeholder tracks** (synthesised, 42 s each, spread across the map) so a journey works out of the box. Replace them with real music — see §4.

## 2. What's on screen

| Screen | What it does |
|---|---|
| **Before we start** | Says what is sensed and where it goes (nowhere). Choose camera or manual. |
| **Now** | Your live position on the map, the sensing status in plain words, the target chips, and a preview of the path. Tap the map to check in manually — that always wins over the camera. "Explain before acting" shows what it noticed before the music starts. |
| **Journey** | The path, what's playing, where the reading is. If the reading drifts away from the path for 20 s, the remaining steps re-plan and it says so. |
| **How that went** | One rating, one note. Feeds the log. |
| **Library** | Every track and where it sits. Tap a track, then tap the map to place it. Your ear is the model. |
| **Settings** | Sensing mode, camera preview, behaviour, reading tuning, and **Export as JSON** of the whole log. |

## 3. Sensing modes (Settings)

| Mode | How | When to use |
|---|---|---|
| **Camera (on phone)** — default | A WebView runs MediaPipe Face Landmarker on-device and posts two numbers to the app. First run downloads ≈ 8 MB (model + WebAssembly), then it's cached. | Normal use. |
| **Manual only** | No camera. Tap the map. | Privacy-first testing; also the honest fallback in interviews where someone doesn't want a camera. |
| **Camera via laptop** | The phone sends a tiny JPEG every 1.5 s to `server/read_face.py` running on your laptop. | If the in-app camera page won't start on your phone (see troubleshooting). |
| **Demo trajectory** | A scripted tense → calm reading over 3 minutes. | Screen recordings, showing the concept without a face. |

**Laptop server** (only for the third mode):

```powershell
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python read_face.py
```

It prints a URL like `http://192.168.0.23:8765`. Paste that into Settings → Laptop server URL. Phone and laptop on the same Wi-Fi, or start a hotspot on the phone and connect the laptop to it (that also works in a parked car).

## 4. Adding real music

1. Drop `.mp3` / `.m4a` / `.wav` files into `assets/music/`.
2. Run `node scripts/build-manifest.js` (keeps existing tags, adds new files as *untagged*).
3. Restart `npx expo start` (press `r` in the terminal, or restart).
4. In the app → Library, tap each new track, listen, tap the map where it sits.

Delete the placeholder files whenever you like (and re-run the script). Untagged tracks are never used in a journey.

To regenerate the placeholders: `pip install numpy scipy` then `python scripts/make-placeholder-music.py` (needs `ffmpeg` on PATH).

## 5. Jen: composing the missing tracks

[Jen](https://www.jenmusic.ai) (Futureverse) is a text-to-music model trained on licensed music; you own what it generates. HealthySongs uses it for the **selection decision**: for every step of a journey it asks *is there a track in my library close enough to this point on the map?* If yes, it plays yours. If not, it writes a prompt for that exact point and Jen composes one in a few seconds.

**No waiting:** the journey starts at once with the closest library track (the "step lighter" match). Jen composes the later steps in the background, and each one is swapped in the moment it's ready, before you reach it. The Journey screen shows how many are ready. The *decision* itself (where you are, where to go, what kind of track) is instant and runs on the phone; Jen's job is to make the track for that decision.

**Setup:** the key lives in `.env.local` (git-ignored):

```
EXPO_PUBLIC_JEN_API_KEY=apikey_...
```

Restart `npx expo start` after changing it. You can also paste a key in Settings → Music · Jen, which overrides the file.

**Settings → Music · Jen**

| Setting | What it does |
|---|---|
| Library + Jen (default) | Your track where one sits within the threshold of the step; Jen composes the rest. |
| Jen only | Every step composed for its point. |
| Library only | No generation, works offline. |
| Style note | Appended to every prompt, e.g. "with Persian setar and soft daf". This is what makes it sound like *you*. |
| Track length | 15–180 s. Up to 60 s costs $0.04 per track, up to 120 s $0.08. |
| Compose when nearest track is farther than | The decision threshold (0.35 default). Lower = more composing. |
| Proxy URL | Route calls through `server/jen_proxy.py` so the key stays on the laptop. |

**How a prompt is built** (`src/engine/prompt.ts`, readable rules): arousal sets tempo (56–128 BPM), density and dynamics; valence sets mode and harmonic colour; the region of the map picks instrumentation. Example for a tense start:

> Instrumental, no vocals. Pulsing analog synths, tight electronic drums, tense staccato strings. Minor key, melancholic, dark harmonies. Driving, intense, dense rhythm, around 114 BPM. Layered and full, builds momentum.

…and for the calm end of the same journey:

> Instrumental, no vocals. Warm acoustic guitar, soft piano, light strings, gentle brushed percussion. Major key, warm, gentle. Slow, calm, soft dynamics, around 70 BPM. Slowly evolving, minimal, no sudden changes.

Every decision (kept / composed / fell back, the distance, the prompt) is logged as a `selection` event. Composed tracks are downloaded to the phone (Jen deletes its copies after 24 h) and join the Library with a **jen** pill, so the library grows with use.

**Seed the library once from your laptop** (permanent files, already placed on the map):

```powershell
node scripts/jen-seed-library.js                    # 3×3 grid, 9 tracks, about $0.36
node scripts/jen-seed-library.js --grid 4 --taste "with Persian setar"
node scripts/build-manifest.js
```

**Key safety:** Jen's docs say never to put a key in client code, and they may disable keys found in public. An app on your own phone is fine for the prototype. Before sharing the app or the folder, use the proxy, and never commit `.env.local`.

## 5b. With Spotify

**Now → Spotify.** While Spotify plays on your phone, HealthySongs checks every few seconds:

- **Is this song helping?** If you placed it on the map (the *This song feels…* chips) or it's in one of your zone playlists, it knows where the song sits. It says *not helping* when the song is angry or sad music, or darker or more intense than you are. For songs it can't place, it watches you: if you get clearly worse for 15 s while it plays, it counts as not helping.
- **What next?** A song one step lighter than you, toward where you're heading (Balance by default).
- **Queue next / Play now** do what they say. Two switches do it for you: *Queue the next step on its own* (near the end of each song) and *Replace songs that make it worse*. They only run while this screen is open.
- **It learns.** What each song did to you is saved. A song that made you feel worse is suggested less, and after it happens twice it isn't suggested at all.

**Setup (once, ~5 minutes):**

1. https://developer.spotify.com/dashboard → *Create app* → tick *Web API*.
2. In the app's settings, add the **Redirect URI** that HealthySongs shows in Settings → Spotify. With `npx expo start --tunnel` it is `https://<your-tunnel>.exp.direct/spotify-relay`: Spotify only accepts https for new apps, so a tiny page in `metro.config.js` receives the answer and forwards it to Expo Go. The tunnel name is stored in `.expo/settings.json`, so it stays the same between runs.
3. *User Management*: add your Spotify account's email. New apps are in Development mode, which only lets listed users in (max 5), and **the app owner needs Spotify Premium**.
4. Copy the **Client ID** into Settings → Spotify (or `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` in `.env.local`). There's no secret: sign-in uses PKCE.
5. Optional but recommended: make a few playlists of your own (Calm, Gentle, Focus, Warm lift, Bright, Steady energy) and paste their links in Settings → Spotify. Suggestions then come from music you chose. Without them it searches Spotify by keywords and labels those suggestions as a guess.

**Spotify's limits you'll hit:** queue/play/skip need Premium and an active device (open Spotify, play something first). Since Nov 2024 new apps can't ask Spotify how a song feels (audio-features and recommendations were switched off), which is why songs are placed by you, by your playlists, or by watching your reaction. Since Feb 2026, the app can only read playlists you own or collaborate on.

## 6. How it works (for the case study)

```
src/engine/spectrum.ts     the map: valence/arousal, named regions, targets
src/engine/blendshapes.ts  face → raw valence/arousal (readable weights, not a black box)
src/engine/fusion.ts       manual > face > demo; resting-face baseline; smoothing
src/engine/planner.ts      iso-principle path + nearest-track selection; drift re-planning
src/engine/regulate.ts     the safety rules: meet a step lighter, never angry/sad music, measure what each track does
src/engine/prompt.ts       spectrum point → Jen prompt (tempo, mode, instruments, texture)
src/jen/client.ts          Jen API: generate, poll, download to the phone
src/jen/fill.ts            the keep-or-compose decision per journey step
src/sensing/*              the three sensors (WebView/MediaPipe, laptop, demo)
src/audio/useJourneyRunner.ts  plays steps, ramps volume, watches for drift
src/spotify/*              Spotify sign-in (PKCE), now-playing / queue / play, suggestions
src/app/*                  screens (expo-router)
src/store/useApp.ts        state + the research log (persisted)
server/read_face.py        optional laptop sensor, same weights
server/jen_proxy.py        optional Jen proxy, keeps the key on the laptop
scripts/jen-seed-library.js  compose a grid of tracks into assets/music/
```

Design rules baked in, from the kickoff and the prior-art scan:

- **Meet a step lighter, then move.** The first track is close to where you are but a little toward the target: tender rather than sad, strong-but-steady rather than angry. Tense (angry) and heavy (sad) tracks are never played. Energy (arousal) moves ahead of feeling (valence) on the path, which is what the calming literature suggests.
- **Balance by default.** The direction follows how you seem: tense → calm, low → gently brighter, flat → steadier, restless → settled, already good → stay there. You can still pick Calm, Bright, Focus and so on.
- **Watch what the music does.** If you get clearly worse while a track plays (15 s of it, after the first 20 s), the track is cut, remembered as unhelpful, and the rest re-plans from where you are now, still a step lighter. Every effect is logged as an `effect` event.
- **Say what you noticed before you act.** "Explain before acting" is on by default. Trust was the theme most likely to come out of interviews; this is its first design answer.
- **The person always wins.** A tap on the map overrides the camera for three minutes and re-centres it.
- **Mechanism quiet, journey visible.** The camera preview is off by default; the map and the path are the interface.
- **Log everything.** Readings (every 5 s), check-ins, journeys, track changes, adjustments, feedback. Export from Settings; it's the data for the write-up.

The face→mood mapping is a **heuristic**, on purpose. The weights in `blendshapes.ts` are readable and arguable. Change them after testing, and write down what you changed and why in `../docs/ai-log.md`.

## 7. Troubleshooting

- **Camera page stays on "loading model" / "error"** — the phone couldn't fetch MediaPipe from the CDN, or the WebView refused the camera. Check the phone has internet the first time; on Android, make sure Expo Go has camera permission in system settings. If it still fails, switch to **Camera via laptop** or **Manual only**. iOS: the in-app camera page needs iOS 15+.
- **No sound** — iPhone silent switch is ignored (playsInSilentMode is on) but the volume rocker isn't. Check Bluetooth isn't grabbing the audio.
- **"Jen rejected the API key"** — check `.env.local`, restart Expo; or paste it in Settings. **"out of credit"** — top up at platform.jenmusic.ai. When Jen fails the journey falls back to your library and says so.
- **"Tag some music first"** — fewer than two tagged tracks. Library → tag them.
- **Reading is jumpy** — raise "Smoothing" in Settings (3–5 s). **Reading barely moves** — raise "Face gain".
- **Everything feels off after a while** — Settings → Reset to defaults, then Show the consent screen again.

## 8. What's deliberately not built

Voice tone (the kickoff idea) — the mic pipeline is a separate rabbit hole; the sensing layer is pluggable (`src/sensing/useSensing.tsx`) so it can be added as a fourth source. Background sensing — the camera only runs while the app is open, by design.
