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

Recipe URI substitution: the recipes baked into the image hard-code
`http://gateway:3000/mcp` (the docker-compose hostname). On Fly the
gateway lives at `<gateway-app>.internal:3000`, so on container start
we rewrite each recipe's first-extension URI to `${GATEWAY_URL}/mcp`
and stash the rewritten copy under /tmp/goose-recipes/. goose run
points at the rewritten one.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("gloop")

SRC_RECIPE_DIR = "/etc/goose-recipes"
RUNTIME_RECIPE_DIR = "/tmp/goose-recipes"
GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://gateway:3000").rstrip("/")
MCP_URL = f"{GATEWAY_URL}/mcp"


def _rewrite_extensions(data: dict) -> dict:
    for ext in data.get("extensions") or []:
        if ext.get("type") == "streamable_http":
            ext["uri"] = MCP_URL
    return data


def _materialize_recipes() -> None:
    """Resolve the runtime recipe set, rewriting gateway URIs to the live
    GATEWAY_URL.

    Source priority:
      1. GOOSE_RECIPE_YAML env (live content the orchestrator pushed in;
         this is what /personas/[id] saves go through on Fly)
      2. /etc/goose-recipes/<persona>.yaml (image-baked default)

    The runtime persona lives in GOOSE_RECIPE; we materialize *just* that
    one when env-content is provided, plus all of the image-baked ones as
    safe fallbacks for any other persona that might be requested.
    """
    Path(RUNTIME_RECIPE_DIR).mkdir(parents=True, exist_ok=True)
    persona = os.environ.get("GOOSE_RECIPE", "research")
    rewritten = 0

    # 1) Live content from the orchestrator, if any.
    yaml_text = os.environ.get("GOOSE_RECIPE_YAML", "").strip()
    if yaml_text:
        try:
            data = _rewrite_extensions(yaml.safe_load(yaml_text))
            (Path(RUNTIME_RECIPE_DIR) / f"{persona}.yaml").write_text(
                yaml.safe_dump(data, sort_keys=False),
            )
            log.info("materialized recipe for %s from GOOSE_RECIPE_YAML (%d bytes)", persona, len(yaml_text))
            rewritten += 1
        except Exception:
            log.exception("failed to parse GOOSE_RECIPE_YAML; falling back to baked default")

    # 2) Image-baked defaults — copy any we don't already have a runtime version of.
    src = Path(SRC_RECIPE_DIR)
    if src.exists():
        for path in src.glob("*.yaml"):
            dst = Path(RUNTIME_RECIPE_DIR) / path.name
            if dst.exists():
                continue
            try:
                data = _rewrite_extensions(yaml.safe_load(path.read_text()))
                dst.write_text(yaml.safe_dump(data, sort_keys=False))
                rewritten += 1
            except Exception as e:
                log.exception("failed to rewrite %s: %s", path, e)
                shutil.copy2(path, dst)
    log.info("materialized %d recipe(s) at %s with gateway=%s", rewritten, RUNTIME_RECIPE_DIR, MCP_URL)


_materialize_recipes()

app = FastAPI()


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


def _recipe_path() -> str:
    persona = os.environ.get("GOOSE_RECIPE", "research")
    # Prefer the rewritten copy (extension URI points at $GATEWAY_URL).
    for candidate in (
        os.path.join(RUNTIME_RECIPE_DIR, f"{persona}.yaml"),
        os.path.join(SRC_RECIPE_DIR, f"{persona}.yaml"),
    ):
        if os.path.exists(candidate):
            return candidate
    raise RuntimeError(f"recipe not found for persona={persona}")


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

            base_recipe = _recipe_path()
            log.info("invoking goose run for recipe=%s text-len=%d", base_recipe, len(text))

            # Inline the user prompt into a per-turn copy of the recipe.
            # Earlier we passed it via `--params user_message=<text>` but
            # goose's params parser silently fails on multi-line VALUE
            # strings (e.g. the conversation-history prefix the web app
            # splices in), so the subprocess exited with nothing on stdout
            # and the chat looked dead. Embedding directly into the recipe's
            # `prompt` field avoids the params codec entirely.
            with open(base_recipe, "r", encoding="utf-8") as f:
                recipe_data = yaml.safe_load(f) or {}
            recipe_data.pop("parameters", None)
            recipe_data["prompt"] = text
            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", suffix=".yaml", delete=False, dir=RUNTIME_RECIPE_DIR,
            ) as tmp:
                yaml.safe_dump(recipe_data, tmp, sort_keys=False)
                tmp_recipe = tmp.name

            proc = await asyncio.create_subprocess_exec(
                "goose", "run",
                "--no-session",
                "--recipe", tmp_recipe,
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
            try:
                os.unlink(tmp_recipe)
            except OSError:
                pass

    except WebSocketDisconnect:
        log.info("ws disconnected")
    except Exception as e:
        log.exception("ws error")
        try:
            await ws.send_json({"event": "error", "error": str(e)})
        finally:
            await ws.close()
