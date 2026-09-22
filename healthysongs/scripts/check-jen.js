/**
 * Checks the Jen API key in .env.local without generating anything.
 *
 *   node scripts/check-jen.js
 *
 * It asks Jen for the status of a track that does not exist. Jen checks the
 * key before it looks for the track, so the answer says whether the key is
 * accepted, and no credit is spent. The key itself is never printed.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://app.jenmusic.ai/api/v3/public';
const envPath = path.join(__dirname, '..', '.env.local');

function readKey() {
  if (!fs.existsSync(envPath)) return null;
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .find((l) => l.startsWith('EXPO_PUBLIC_JEN_API_KEY='));
  return line ? line.slice('EXPO_PUBLIC_JEN_API_KEY='.length).trim().replace(/^["']|["']$/g, '') : null;
}

(async () => {
  const key = readKey();
  if (!key) {
    console.log('No EXPO_PUBLIC_JEN_API_KEY in .env.local. Add a line like:\n  EXPO_PUBLIC_JEN_API_KEY=your-key');
    process.exit(1);
  }
  console.log(`Key found: ${key.length} characters, starting "${key.slice(0, 4)}…"`);
  const res = await fetch(`${BASE}/generation_status/key-check-${Date.now()}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  }).catch((e) => ({ status: 0, error: e }));
  const s = res.status;
  if (s === 0) console.log(`Could not reach Jen: ${res.error.message}`);
  else if (s === 401 || s === 403) console.log(`REJECTED (${s}). Jen does not accept this key. Make a new one in your Jen account and put it in .env.local.`);
  else if (s === 402) console.log('KEY OK, but the account is out of credit (402). Top up in your Jen account.');
  else if (s === 429) console.log('Rate limited (429). Wait a minute and run this again.');
  else if (s < 500) console.log(`KEY ACCEPTED. Jen answered ${s} for the made-up track, which is expected.`);
  else console.log(`Jen had a server problem (${s}). Try again later.`);
})();
