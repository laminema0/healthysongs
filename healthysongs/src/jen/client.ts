/**
 * Jen music API client (https://api.jenmusic.ai/docs).
 *
 *   POST {BASE}/track/generate          { prompt, duration }  → { data: [{ id, status }] }
 *   GET  {BASE}/generation_status/:id                         → { data: { id, status, url? } }
 *        status: waiting | generating | generated | error
 *
 * Generated files are deleted by Jen after 24 hours, so every track is
 * downloaded into the app's document folder as soon as it's ready.
 *
 * Pricing at time of writing: $0.04 per track up to 60 s, $0.08 up to 120 s.
 * Limits: 150 requests / 10 s, 10 concurrent generations per key.
 *
 * About the key: Jen's docs say not to put keys in client code. For a
 * prototype on your own phone that is acceptable; for anything shared,
 * move these calls behind server/jen_proxy.py and set JEN proxy mode.
 */
import { Directory, File, Paths } from 'expo-file-system';

export const JEN_BASE = 'https://app.jenmusic.ai/api/v3/public';

export type JenConfig = {
  apiKey: string;
  /** If set, calls go to this URL (server/jen_proxy.py) instead of Jen directly. */
  proxyUrl?: string | null;
};

export class JenError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

function base(cfg: JenConfig) {
  return cfg.proxyUrl ? cfg.proxyUrl.replace(/\/$/, '') : JEN_BASE;
}

function headers(cfg: JenConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!cfg.proxyUrl) h.Authorization = `Bearer ${cfg.apiKey}`;
  return h;
}

async function json(res: Response) {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg =
      res.status === 401 || res.status === 403 ? 'Jen rejected the API key (401/403). Check it in Settings.'
      : res.status === 402 ? 'Jen says the account is out of credit (402).'
      : res.status === 429 ? 'Jen rate limit hit (429). Wait a minute.'
      : body?.message || body?.error || `Jen HTTP ${res.status}`;
    throw new JenError(msg, res.status);
  }
  return body;
}

export async function jenGenerate(cfg: JenConfig, prompt: string, durationSec: number): Promise<string> {
  const duration = Math.max(10, Math.min(900, Math.round(durationSec)));
  const res = await fetch(`${base(cfg)}/track/generate`, {
    method: 'POST', headers: headers(cfg), body: JSON.stringify({ prompt, duration }),
  });
  const body = await json(res);
  const id = body?.data?.[0]?.id ?? body?.data?.id ?? body?.id;
  if (!id) throw new JenError('Jen answered without a track id');
  return String(id);
}

export type JenStatus = { id: string; status: 'waiting' | 'generating' | 'generated' | 'error' | string; url?: string };

export async function jenStatus(cfg: JenConfig, id: string): Promise<JenStatus> {
  const res = await fetch(`${base(cfg)}/generation_status/${encodeURIComponent(id)}`, { headers: headers(cfg) });
  const body = await json(res);
  const d = body?.data ?? body;
  return { id: d?.id ?? id, status: d?.status ?? 'waiting', url: d?.url };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function jenWait(cfg: JenConfig, id: string, opts: { timeoutMs?: number; intervalMs?: number; onStatus?: (s: string) => void } = {}): Promise<string> {
  const timeout = opts.timeoutMs ?? 120000;
  const interval = opts.intervalMs ?? 2000;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await jenStatus(cfg, id);
    opts.onStatus?.(s.status);
    if (s.status === 'generated' && s.url) return s.url;
    if (s.status === 'error') throw new JenError('Jen reported a generation error');
    await sleep(interval);
  }
  throw new JenError('Jen took too long (over 2 minutes)');
}

const jenDir = () => {
  const d = new Directory(Paths.document, 'jen');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

/** Download into the app's documents so the track outlives Jen's 24 h window. */
export async function jenDownload(url: string, id: string): Promise<string> {
  const target = new File(jenDir(), `${id}.mp3`);
  if (target.exists) return target.uri;
  const f = await File.downloadFileAsync(url, target, { idempotent: true });
  return f.uri;
}

/** Generate → wait → download. Returns a local file uri. */
export async function jenMakeTrack(cfg: JenConfig, prompt: string, durationSec: number, onStatus?: (s: string) => void): Promise<{ id: string; uri: string }> {
  onStatus?.('requesting');
  const id = await jenGenerate(cfg, prompt, durationSec);
  const url = await jenWait(cfg, id, { onStatus });
  onStatus?.('downloading');
  const uri = await jenDownload(url, id);
  onStatus?.('ready');
  return { id, uri };
}

/** Delete every cached Jen track. */
export function jenClearCache() {
  const d = new Directory(Paths.document, 'jen');
  if (d.exists) d.delete();
}
