"""Thin WebSocket wrapper around `goose run`.

Each WS message of the form {"message": "..."} spawns a fresh goose run
subprocess. stdout NDJSON lines are forwarded as WS text frames verbatim
(stream-json emits one JSON event per line). On goose exit we send a
synthetic {"event": "done", "exit_code": N} frame and wait for the next
message.

A goose-runner container is meant to be one-chat-session-per-machine, so
having no persisted goose session inside (passing --no-session) is fine —
conversation continuity is handled by the caller passing message history
in subsequent prompts (M4's responsibility).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("gloop")

RECIPE_DIR = "/etc/goose-recipes"

app = FastAPI()


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


def _recipe_path() -> str:
    persona = os.environ.get("GOOSE_RECIPE", "research")
    path = os.path.join(RECIPE_DIR, f"{persona}.yaml")
    if not os.path.exists(path):
        raise RuntimeError(f"recipe not found for persona={persona}: {path}")
    return path


@app.websocket("/chat")
async def chat(ws: WebSocket) -> None:
    await ws.accept()
    log.info("ws connected")
    try:
        while True:
            payload = await ws.receive_json()
            text = (payload.get("message") or "").strip()
            if not text:
                await ws.send_json({"event": "error", "error": "missing 'message'"})
                continue

            recipe = _recipe_path()
            log.info("invoking goose run for recipe=%s text=%r", recipe, text[:80])

            # `--recipe` and `--text` are mutually exclusive in goose; instead
            # the recipe declares a `user_message` parameter and we pass it via
            # `--params`. subprocess_exec uses execvp, so no shell quoting is
            # needed — newlines / quotes / backticks pass through verbatim.
            proc = await asyncio.create_subprocess_exec(
                "goose", "run",
                "--no-session",
                "--recipe", recipe,
                "--params", f"user_message={text}",
                "--output-format", "stream-json",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            async def pump_stdout() -> None:
                assert proc.stdout is not None
                async for line in proc.stdout:
                    s = line.decode(errors="replace").rstrip()
                    if not s:
                        continue
                    # stream-json lines are already valid JSON; forward verbatim.
                    await ws.send_text(s)

            async def pump_stderr() -> None:
                assert proc.stderr is not None
                async for line in proc.stderr:
                    s = line.decode(errors="replace").rstrip()
                    if not s:
                        continue
                    await ws.send_json({"event": "stderr", "line": s})

            await asyncio.gather(pump_stdout(), pump_stderr())
            rc = await proc.wait()
            await ws.send_json({"event": "done", "exit_code": rc})

    except WebSocketDisconnect:
        log.info("ws disconnected")
    except Exception as e:
        log.exception("ws error")
        try:
            await ws.send_json({"event": "error", "error": str(e)})
        finally:
            await ws.close()
