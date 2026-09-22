"""
Optional Jen proxy: keeps the API key on your laptop instead of in the app.

    set JEN_API_KEY=apikey_...        (PowerShell: $env:JEN_API_KEY="apikey_...")
    python jen_proxy.py
    → prints http://<laptop-ip>:8766 ; paste into the app's Settings → Proxy URL

Or it reads EXPO_PUBLIC_JEN_API_KEY from ../.env.local if JEN_API_KEY isn't set.
Uses only the Python standard library.
"""
import json
import os
import re
import socket
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "https://app.jenmusic.ai/api/v3/public"
PORT = 8766


def read_key() -> str:
    k = os.environ.get("JEN_API_KEY", "").strip()
    if k:
        return k
    env = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env):
        m = re.search(r"^\s*EXPO_PUBLIC_JEN_API_KEY\s*=\s*(.+)$", open(env, encoding="utf-8").read(), re.M)
        if m:
            return m.group(1).strip().strip("'\"")
    return ""


KEY = read_key()


class Handler(BaseHTTPRequestHandler):
    def _forward(self, method: str, body: bytes | None = None):
        path = self.path
        if not (path.startswith("/track/generate") or path.startswith("/generation_status/")):
            self.send_response(404); self.end_headers(); return
        req = urllib.request.Request(BASE + path, data=body, method=method,
                                     headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            data, code = e.read(), e.code
        except Exception as e:  # network
            data, code = json.dumps({"error": str(e)}).encode(), 502
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._forward("GET")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        self._forward("POST", self.rfile.read(n) if n else b"{}")

    def log_message(self, *args):
        pass


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80)); return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    if not KEY:
        raise SystemExit("No key: set JEN_API_KEY or put EXPO_PUBLIC_JEN_API_KEY in ../.env.local")
    print(f"\nJen proxy → http://{lan_ip()}:{PORT}   (Settings → Proxy URL)\n")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
