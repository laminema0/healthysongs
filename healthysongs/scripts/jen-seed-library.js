#!/usr/bin/env node
/**
 * Seed the music library with Jen: composes one track for each point on a
 * grid across the valence/arousal map, downloads them into assets/music/,
 * and records their positions in assets/music/tags.json so they arrive
 * already placed. Then run build-manifest.js.
 *
 *   node scripts/jen-seed-library.js            # 9 points, 60 s each (≈ $0.36)
 *   node scripts/jen-seed-library.js --grid 4   # 16 points (≈ $0.64)
 *   node scripts/jen-seed-library.js --taste "with Persian setar"
 *
 * Reads the key from .env.local (EXPO_PUBLIC_JEN_API_KEY) or JEN_API_KEY.
 * Needs Node 18+ (built-in fetch).
 *
 * The prompt rules below mirror src/engine/prompt.ts. Keep them in sync.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MUSIC = path.join(ROOT, 'assets', 'music');
const TAGS = path.join(MUSIC, 'tags.json');
const BASE = 'https://app.jenmusic.ai/api/v3/public';

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

function readKey() {
  if (process.env.JEN_API_KEY) return process.env.JEN_API_KEY.trim();
  const envFile = path.join(ROOT, '.env.local');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^\s*EXPO_PUBLIC_JEN_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

// ---- mirror of src/engine/prompt.ts ---------------------------------------
function region(v, a) {
  if (v < -0.2 && a > 0.2) return 'tense';
  if (v < -0.2 && a < -0.2) return 'heavy';
  if (v > 0.2 && a > 0.2) return 'bright';
  if (v > 0.2 && a < -0.2) return 'calm';
  if (a < -0.2) return 'flat';
  if (a > 0.2) return 'restless';
  if (v < -0.2) return 'down';
  if (v > 0.2) return 'good';
  return 'neutral';
}
function prompt(v, arousal, taste) {
  const a = (arousal + 1) / 2;
  const bpm = Math.round(56 + a * 72);
  const mode = v < -0.45 ? 'minor key, melancholic, dark harmonies' : v < -0.1 ? 'minor key, reflective, bittersweet'
    : v < 0.25 ? 'modal, neutral and open, unresolved' : v < 0.55 ? 'major key, warm, gentle' : 'major key, bright, uplifting';
  const energy = a < 0.2 ? 'very slow, soft dynamics, lots of space and silence' : a < 0.42 ? 'slow, calm, soft dynamics'
    : a < 0.6 ? 'steady mid-tempo groove, moderate dynamics' : a < 0.8 ? 'energetic, clear rhythmic drive' : 'driving, intense, dense rhythm';
  const inst = {
    heavy: 'solo felt piano, low cello, distant ambient pads',
    tense: 'pulsing analog synths, tight electronic drums, tense staccato strings',
    bright: 'indie pop band, bright electric guitars, handclaps, light synth lead',
    calm: 'warm acoustic guitar, soft piano, light strings, gentle brushed percussion',
    flat: 'muted electric piano, soft ambient textures, subtle tape hiss',
    restless: 'nervous arpeggiated synths, busy hi-hats, plucked bass',
    down: 'lo-fi electric piano, dusty drums, mellow bass',
    good: 'acoustic guitar, upright bass, light percussion, warm keys',
    neutral: 'electric piano, soft drums, round bass',
  }[region(v, arousal)];
  const texture = a < 0.35 ? 'slowly evolving, minimal, no sudden changes' : a > 0.7 ? 'layered and full, builds momentum' : 'balanced, smooth transitions';
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const base = `Instrumental, no vocals. ${cap(inst)}. ${cap(mode)}. ${cap(energy)}, around ${bpm} BPM. ${cap(texture)}.`;
  return taste ? `${base} Style: ${taste}.` : base;
}
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(key, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function compose(key, p, duration) {
  const g = await call(key, `${BASE}/track/generate`, { method: 'POST', body: JSON.stringify({ prompt: p, duration }) });
  const id = g?.data?.[0]?.id ?? g?.data?.id;
  if (!id) throw new Error('no id in response: ' + JSON.stringify(g).slice(0, 200));
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await call(key, `${BASE}/generation_status/${id}`);
    const st = s?.data?.status;
    if (st === 'generated' && s.data.url) return { id, url: s.data.url };
    if (st === 'error') throw new Error('Jen reported an error for ' + id);
    await sleep(2500);
  }
  throw new Error('timed out waiting for ' + id);
}

(async () => {
  const key = readKey();
  if (!key) { console.error('No key. Put EXPO_PUBLIC_JEN_API_KEY=... in .env.local or set JEN_API_KEY.'); process.exit(1); }
  const n = Math.max(2, Math.min(5, parseInt(arg('grid', '3'), 10)));
  const duration = parseInt(arg('duration', '60'), 10);
  const taste = arg('taste', '');
  const pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = +(-0.8 + (1.6 * i) / (n - 1)).toFixed(2);
    const a = +(-0.8 + (1.6 * j) / (n - 1)).toFixed(2);
    pts.push({ v, a });
  }
  const cost = (duration <= 60 ? 0.04 : 0.08) * pts.length;
  console.log(`Composing ${pts.length} tracks, ${duration}s each (≈ $${cost.toFixed(2)})…`);

  const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};
  // Jen allows 10 concurrent generations; stay under it
  const queue = [...pts];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const { v, a } = queue.shift();
      const p = prompt(v, a, taste);
      const name = `jen-${region(v, a)}-v${v}-a${a}`.replace(/\./g, '_');
      try {
        const { id, url } = await compose(key, p, duration);
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        fs.writeFileSync(path.join(MUSIC, `${name}.mp3`), buf);
        tags[name] = { valence: v, arousal: a, prompt: p, jenId: id };
        fs.writeFileSync(TAGS, JSON.stringify(tags, null, 2));
        console.log(`  ✓ ${name}`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${e.message}`);
      }
    }
  });
  await Promise.all(workers);
  console.log('Done. Now run: node scripts/build-manifest.js');
})();
