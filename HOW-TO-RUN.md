# How to run everything (VS Code, Windows)

**Open this folder in VS Code:** File → Open Folder → pick `music`.

You need **Node.js 20.19 or newer**. Check: Terminal → Run Task → *Check: Node and npm versions*.
If it's missing or older, install the LTS from https://nodejs.org, then restart VS Code.

---

## A. The live web demo (camera + music)  ← start here

**Ctrl+Shift+B.** That's it.

(It's the default build task: *1 · Live demo*. It starts a small server and opens
http://localhost:8123/live.html in your browser.)

1. Click **Turn camera on**, allow the camera.
2. Pick a target (Calm, Bright…), click **Play**.
3. Change your expression clearly and watch the dots, the feed and the sound.

Stop: click in the terminal, press **Ctrl+C** (or the bin icon on the terminal).

Alternative: **F5** in the Run and Debug panel with *Live demo in Chrome* (or *Edge*).
Without VS Code: double-click `web-demo/start-live-demo.bat`.

---

## B. The phone app (HealthySongs)

Install **Expo Go** on your phone (App Store / Play Store). Phone and laptop on the same Wi-Fi.

1. Terminal → Run Task → **2 · App: install** (first time only, a few minutes).
2. Terminal → Run Task → **3 · App: start**. A QR code appears in the terminal.
3. Scan it: Android inside Expo Go, iPhone with the Camera app.

If the phone can't connect, use **3b · with tunnel** instead.

**Jen:** the key is already in `healthysongs/.env.local`. To fill the library with composed tracks once:
Run Task → **4 · Jen: compose 9 tracks**. Then restart task 3.

---

## If something goes wrong

| What you see | Do this |
|---|---|
| `node` is not recognized | Install Node.js LTS, restart VS Code. |
| *Port 8123 is already in use* | It's already running. Open http://localhost:8123/live.html |
| Camera blocked | Click the camera icon in the address bar → Allow, reload. Close other apps using the camera (Zoom, Teams). |
| Box never appears around your face | More light on your face, face the camera, turn up *Face sensitivity*. |
| `npm install` very slow or errors about files in use | OneDrive is syncing `node_modules`. Pause OneDrive while installing, or copy `healthysongs` to `C:\dev\healthysongs` and run it from there. |
| PowerShell says scripts are disabled (npx.ps1) | Run once in a terminal: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and answer Y. |
| Expo QR won't connect | Use task 3b (tunnel). Check the phone isn't on mobile data. |

Folder map: `web-demo/` live browser demo · `healthysongs/` phone app · `docs/` brief, process map, survey, AI log.
