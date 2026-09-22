/**
 * Spotify sign-in: Authorization Code with PKCE, which is what Spotify asks
 * mobile apps to use. No client secret; the Client ID is public.
 *
 * Setup (once): developer.spotify.com → Dashboard → Create app → Web API.
 * Add the redirect URI this file prints (Settings shows it) and, while the
 * app is in Development mode, add your Spotify account under "Users".
 */
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { SpotifyTokens } from './types';

WebBrowser.maybeCompleteAuthSession();

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
];

/** Where the app itself receives the answer (the sign-in window watches for this). */
const appReturnUrl = () => Linking.createURL('spotify-auth');

/**
 * The URI to register in the Spotify dashboard. Spotify rejects exp:// for new
 * apps, so when the dev server runs with --tunnel (public https address) we
 * use the small relay page in metro.config.js, which forwards to the app.
 * Otherwise (LAN, or a real build with the healthysongs:// scheme) it's the app URL.
 */
export function spotifyRedirectUri(): string {
  const app = appReturnUrl();
  const m = app.match(/^exps?:\/\/([^/]+\.exp\.direct)\//);
  return m ? `https://${m[1]}/spotify-relay` : app;
}

const b64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function queryParam(url: string, key: string): string | null {
  const m = url.match(new RegExp(`[?&#]${key}=([^&#]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function tokenRequest(body: Record<string, string>): Promise<SpotifyTokens & { refreshToken: string }> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(body).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Spotify sign-in failed: ${j.error_description ?? j.error ?? res.status}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? body.refresh_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
}

export async function connectSpotify(clientId: string): Promise<SpotifyTokens> {
  if (!clientId) throw new Error('Add your Spotify Client ID in Settings first.');
  const redirectUri = spotifyRedirectUri();
  const returnUrl = appReturnUrl();
  const verifier = b64url(bytesToB64(Crypto.getRandomBytes(64)));
  const challenge = b64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));
  const state = Crypto.randomUUID();

  const url = 'https://accounts.spotify.com/authorize?' + [
    ['response_type', 'code'],
    ['client_id', clientId],
    ['scope', SPOTIFY_SCOPES.join(' ')],
    ['redirect_uri', redirectUri],
    ['code_challenge_method', 'S256'],
    ['code_challenge', challenge],
    ['state', state],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  const res = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (res.type !== 'success') throw new Error('Sign-in was cancelled.');
  const err = queryParam(res.url, 'error');
  if (err) throw new Error(err === 'access_denied' ? 'You declined access in Spotify.' : `Spotify said: ${err}`);
  if (queryParam(res.url, 'state') !== state) throw new Error('Sign-in answer did not match the request. Try again.');
  const code = queryParam(res.url, 'code');
  if (!code) throw new Error('Spotify did not send a code back.');

  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
}

export function refreshSpotify(clientId: string, tokens: SpotifyTokens): Promise<SpotifyTokens> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId });
}
