#!/usr/bin/env python3
"""Tiny sync HTTP service that runs alongside agentgateway.

Purpose: let the web app push registry edits (from /registry) to the
gateway's Volume so the gateway's `refreshInterval` picks them up.
The gateway itself has no admin write API for the registry file, so we
sit beside it and write the file on its behalf.

Endpoints (all require X-Sync-Secret header matching SYNC_SECRET env):
  GET  /registry  -> current registry JSON
  POST /registry  -> body is JSON, atomically replaces the file
  GET  /healthz   -> {"ok": true}, no auth

Listens on :15001. Internal-only on Fly (no public service mapping).
Written in stdlib only so the gateway runtime image stays small.
"""
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REGISTRY_PATH = os.environ.get("REGISTRY_PATH", "/var/registry/registry.json")
LISTEN_PORT = int(os.environ.get("REGISTRY_SYNC_PORT", "15001"))
SECRET = os.environ.get("SYNC_SECRET", "")


def _send_json(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _authed(handler: BaseHTTPRequestHandler) -> bool:
    if not SECRET:
        # Closed-by-default: refuse if the secret isn't even set on the gateway.
        _send_json(handler, 503, {"error": "SYNC_SECRET not configured"})
        return False
    if handler.headers.get("x-sync-secret") != SECRET:
        _send_json(handler, 401, {"error": "unauthorized"})
        return False
    return True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: D401
        sys.stderr.write(f"[registry-sync] {fmt % args}\n")

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/healthz":
            _send_json(self, 200, {"ok": True})
            return
        if self.path == "/registry":
            if not _authed(self):
                return
            try:
                with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                _send_json(self, 200, data)
            except FileNotFoundError:
                _send_json(self, 404, {"error": "registry not yet seeded"})
            except Exception as e:
                _send_json(self, 500, {"error": str(e)})
            return
        _send_json(self, 404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/registry":
            _send_json(self, 404, {"error": "not found"})
            return
        if not _authed(self):
            return
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            _send_json(self, 400, {"error": f"invalid json: {e}"})
            return
        # Atomic replace so the gateway never reads a half-written file.
        os.makedirs(os.path.dirname(REGISTRY_PATH), exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".registry-", dir=os.path.dirname(REGISTRY_PATH))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, REGISTRY_PATH)
        except Exception as e:
            try: os.unlink(tmp)
            except FileNotFoundError: pass
            _send_json(self, 500, {"error": str(e)})
            return
        _send_json(self, 200, {"ok": True, "tools": len(data.get("tools") or [])})


def main() -> None:
    server = ThreadingHTTPServer(("::", LISTEN_PORT), Handler)
    print(f"[registry-sync] listening on :{LISTEN_PORT} -> {REGISTRY_PATH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
