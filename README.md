# gloop

Author goose personas, deploy them as ephemeral Fly Machines, and watch them
use composed virtual tools through agentgateway.

A working demo of:

- The **Fly Machines API as a "serverless server"** — boot a Firecracker VM in
  ~300 ms per chat session, tear it down on idle. No FLAME (Elixir-only) or
  Lambda. Just docker locally, Fly Machines on prod.
- **agentgateway with virtual tools** — using
  [Jake Mannix's fork](https://github.com/jakemannix/agentgatewaygastown) on
  `feature/tool-algebra-cleanup`, which adds composition primitives
  (scatter-gather, pipeline, arrayMap, nested) over upstream's MCP.
- **N goose personas, one gateway** — each persona has its own recipe and
  scoped tool subset; all share one MCP control plane. New personas can be
  authored from the UI without redeploying anything.

Two upstream demos from Jake's fork are merged behind one gateway:
**research-assistant** (5 MCP services for Exa / arXiv / GitHub / HF +
a small SQLite-vec knowledge graph) and **ecommerce** (5 services for
catalog / cart / order / inventory / supplier). 51 virtual tools + 42
backend tools come for free.

## Architecture

```
                       ┌─────────────────────────────────┐
                       │   Next.js (apps/web, port 3001) │
                       │   - Auth.js + GitHub OAuth      │
                       │   - Persona builder + curator   │
                       │   - Registry editor             │
                       │   - Chat UI (markdown + tools)  │
                       │   - Orchestrator                │
                       └────┬────────────────┬───────────┘
                            │ Machines API   │ MCP HTTP
                            │ (or docker run)│
                            ▼                ▼
   ┌──────────────────┐  ┌──────────────────────────────┐
   │ goose-runner ×N  │  │ agentgateway (port 3000)     │
   │ (per chat)       │  │ - virtual tool registry      │
   │ - FastAPI WS     │──┤ - admin UI (port 15000/ui)   │
   │ - goose CLI      │  │ - hot-reload registry on 10s │
   │ - one recipe each│  └──────┬───────────────┬───────┘
   └──────────────────┘         │               │
                                ▼               ▼
                ┌────────────────────┐  ┌────────────────────┐
                │ research-mcp-bundle│  │ ecommerce-mcp-bundle│
                │ (5 svcs, sqlite-vec)│  │ (5 svcs, sqlite-vec)│
                └────────────────────┘  └────────────────────┘
```

Runtime layout:

| component                | local                        | fly (M5)                  |
|--------------------------|------------------------------|---------------------------|
| `web` (Next.js)          | host process, port 3001      | long-running app          |
| `gateway`                | docker container, port 3000  | long-running app          |
| `research-mcp-bundle`    | docker container             | long-running app + Volume |
| `ecommerce-mcp-bundle`   | docker container             | long-running app + Volume |
| `goose-runner` instances | spawned via `docker run -P`  | spawned via Machines API  |

## Prerequisites

- **Docker Desktop** (Linux Containers, BuildKit). The gateway image is built
  from source — first build is ~5 min, cached after.
- **Node 20+** with npm (only needed to run `apps/web` on the host).
- **Anthropic API key** — passed to spawned goose-runner machines.
- **GitHub OAuth app** for sign-in. Create at
  <https://github.com/settings/developers> with:
    - Homepage URL: `http://localhost:3001`
    - Callback URL: `http://localhost:3001/api/auth/callback/github`
    - Device flow: off

## Local setup

```bash
# 1. Clone with the agentgateway submodule pinned to feature/tool-algebra-cleanup
git clone <this-repo>
cd serverless-flying-geese-and-gateway
git submodule update --init --recursive

# 2. Web app deps + env
cd apps/web
npm install
cp .env.example .env.local
# Then fill in (.env.local already has AUTH_SECRET pre-generated):
#   AUTH_GITHUB_ID=<from your OAuth app>
#   AUTH_GITHUB_SECRET=<from your OAuth app>
#   ANTHROPIC_API_KEY=<your key>

# 3. Gateway + bundles. First build is ~5-10 min (Rust + UI bundling).
cd ../..
docker compose build           # builds gateway, both bundles, goose-runner
docker compose up -d gateway research-mcp-bundle ecommerce-mcp-bundle

# 4. Run the web app on the host
cd apps/web
npm run dev      # http://localhost:3001
```

Sign in with GitHub. The home page shows three seeded personas
(research / customer / merchandiser) — pick one to chat. Or click
**+ new persona** to author your own.

The first message in any chat is the slow one (1–3 s for `docker run` +
healthz poll). Subsequent messages reuse the warm container until the
sweeper destroys it after 5 min of idleness.

## Pages

| route                   | what                                                                                       |
|-------------------------|--------------------------------------------------------------------------------------------|
| `/`                     | sign-in + persona picker grid (live warm/cold pills, "+ new persona")                     |
| `/personas/new`         | builder: id, label, glyph, accent color, instructions, initial tool subset                |
| `/personas/[id]`        | curator: checkbox grid over the live tool surface, system instructions, save → recycle    |
| `/chat/[id]`            | chat with markdown + syntax-highlighted code, tool-call cards, "new chat" reset           |
| `/tools`                | live read-only browse of every tool the gateway exposes, grouped by source                |
| `/registry`             | CodeMirror JSON editor over the merged virtual-tool registry; saves hot-reload in 10s     |
| `localhost:15000/ui`    | upstream agentgateway admin UI (embedded in the gateway image)                            |

The sidebar list of personas has a pulsing dot per persona that reflects
the docker-verified state of its goose machine — polled every 5 s.

## Storage

```
apps/web/data/
├── sessions.db                # (userId, persona, sessionId) -> container_id, ws_url, last_used_at
├── personas/
│   ├── <id>.json              # metadata (label, tagline, glyph, color, createdAt)
│   └── <id>.yaml              # goose recipe (mounted into spawned goose-runners as /etc/goose-recipes:ro)
└── gateway/
    └── registry.json          # merged virtual-tool registry (bind-mounted into gateway as /var/registry/registry.json)
```

The `data/personas/` directory is bind-mounted into every spawned
goose-runner container as `/etc/goose-recipes:ro`. Recipes update there
take effect on the *next* spawn — the orchestrator's
`recyclePersonaMachines` stops in-flight machines on save so the next
message respawns with the new recipe.

The gateway hot-reloads `registry.json` on a 10-second `refreshInterval`,
so registry edits land within ~10 s without a restart.

## Common gotchas

- **`ECONNRESET` on the very first chat message** — the orchestrator's
  healthz poll usually catches this, but if you've manually `docker run`
  a goose-runner without waiting for it to bind to :8000, you'll see
  ECONNRESET. Fix: let the orchestrator handle spawn.
- **Gateway returns `421 Invalid Host header`** — the bundled MCP services
  use FastMCP, which auto-enables DNS-rebinding protection on localhost.
  Our `apps/research-mcp-bundle/http_runner.py` patches that off; if you
  rebuild without the patch, expect 421s.
- **`network gloop not found`** when the orchestrator spawns goose-runner —
  docker compose hadn't created the network yet. `docker compose up -d
  gateway research-mcp-bundle ecommerce-mcp-bundle` once and it'll be
  there for subsequent runs.
- **Cargo build is slow first time** — the gateway image is a multi-stage
  Rust + Next.js UI build. ~5–10 min cold, seconds after that thanks to
  BuildKit cache mounts.
- **`/registry` save shows the change in /tools immediately, but goose
  doesn't see it for ~10 s** — that's the gateway's `refreshInterval`.
  Reduce in `apps/gateway/config.yaml.tmpl` if you're impatient.

## Layout

```
apps/
├── web/                    Next.js 16 + Auth.js v5 + Tailwind 4 + shadcn/ui
├── gateway/                Multi-stage Dockerfile (Rust + UI), entrypoint, merge_registries.py
├── research-mcp-bundle/    Python services bundled under supervisord
├── ecommerce-mcp-bundle/   Python services bundled under supervisord
└── goose-runner/           Goose CLI + FastAPI WebSocket wrapper + per-persona recipes
fly/                        One fly.toml per long-running app (M5)
vendor/agentgatewaygastown/ Git submodule, pinned to feature/tool-algebra-cleanup
docker-compose.yml          Local dev — everything except goose machines
```

## Useful commands

```bash
# Inspect the running stack
docker compose ps
docker compose logs gateway --follow

# See the live MCP tool surface from the host
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"x","version":"0"}}}'

# List spawned goose-runner containers
docker ps --filter ancestor=serverless-flying-geese-and-gateway-goose-runner

# Stop everything
docker compose down

# Hard reset (rebuild from scratch)
docker compose down --volumes
docker compose build --no-cache
```

## Implementation history

The project was built milestone-by-milestone. See
`/Users/ldev/.claude/plans/idempotent-floating-hanrahan.md` for the
original plan; commit history runs:

- **M1** — gateway + research bundle locally
- **M2** — add ecommerce bundle, merge gateway configs
- **M3** — goose-runner image (gloop) with research recipe
- **M4** — Next.js UI + Auth.js + local orchestrator (docker run)
- **M6** — design system (shadcn) + virtual tool curator + registry editor
- **M6.5** — dynamic personas via the persona builder
- **M5** — *next*: deploy 4 long-running apps to Fly + Machines API orchestrator

## Credits

- agentgateway by [solo.io](https://agentgateway.dev) and Jake Mannix's
  virtual-tools fork.
- goose by Block (now under the Agentic AI Foundation at the Linux
  Foundation).
- Auth.js, shadcn/ui, react-markdown, CodeMirror.
