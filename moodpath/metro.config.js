// Metro config. Default Expo setup plus one tiny page:
//
//   GET /spotify-relay?code=…&state=…
//
// Spotify only accepts https:// redirect URIs for new apps, and Expo Go's
// own address is exp://…. When the dev server runs with --tunnel it has a
// public https address, so Spotify redirects here and this page forwards the
// answer to the app (exp://<same host>/--/spotify-auth?code=…). The in-app
// sign-in window closes as soon as it sees that exp:// address.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const relayPage = (target) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Back to MoodPath</title>
<style>body{font:16px system-ui,sans-serif;background:#0F1413;color:#E9ECE8;padding:32px}a{color:#B195DA}</style>
</head><body><p>Signed in. Going back to MoodPath…</p><p><a id="go" href="${target}">Tap here if nothing happens</a></p>
<script>location.replace(document.getElementById('go').href);</script></body></html>`;

const upstream = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const inner = upstream ? upstream(middleware, server) : middleware;
  return (req, res, next) => {
    if (req.url && req.url.startsWith('/spotify-relay')) {
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      const query = req.url.slice('/spotify-relay'.length).replace(/"/g, '%22').replace(/</g, '%3C');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(relayPage(`exp://${host}/--/spotify-auth${query}`));
      return;
    }
    return inner(req, res, next);
  };
};

module.exports = config;
