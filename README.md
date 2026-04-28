# serverless-flying-geese-and-gateway

A Fly.io demo combining:

- **goose** AI agents running serverlessly on ephemeral Fly Machines (one per chat session).
- **agentgateway** as the MCP control plane, using [Jake Mannix's fork](https://github.com/jakemannix/agentgatewaygastown) on `feature/tool-algebra-cleanup` for its **virtual-tools** registry (scatter-gather, pipeline, arrayMap, nested composition).
- Two upstream multi-service demos merged behind one gateway: **research-assistant** (5 MCP services for web/arxiv/github/HF search + a small KG) and **ecommerce** (5 services for catalog/cart/order/inventory/supplier).
- A **Next.js + Auth.js** chat UI with three persona routes (`/chat/research`, `/chat/customer`, `/chat/merchandiser`), each spawning its own scoped goose machine.

## Architecture

Four long-running Fly apps:

| App | Role |
|---|---|
| `web` | Next.js front end + Fly Machines API orchestrator |
| `gateway` | Jake's agentgateway, merged registry for both demos |
| `research-mcp-bundle` | All 5 research MCP services in one container, on a Fly Volume |
| `ecommerce-mcp-bundle` | All 5 ecommerce MCP services in one container, on a Fly Volume |

Plus ephemeral goose-runner Machines spawned per `(user, persona, session)` and destroyed after 5 min idle.

See `/Users/ldev/.claude/plans/idempotent-floating-hanrahan.md` for the full plan.

## Layout

```
apps/
  web/                    Next.js 15 + Auth.js
  gateway/                Multi-stage Dockerfile, builds agentgateway from submodule
  research-mcp-bundle/    Python services bundled under supervisord
  ecommerce-mcp-bundle/   Python services bundled under supervisord
  goose-runner/           Goose + WS wrapper + per-persona recipes
fly/                      One fly.toml per long-running app
vendor/agentgatewaygastown/  Git submodule, pinned commit
docker-compose.yml        Local dev — everything except goose machines
```

## Local dev (M1 scope)

```bash
git submodule update --init --recursive
docker compose up gateway research-mcp-bundle
# In another shell:
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should see the research virtual tools (`research_and_fetch`, `multi_source_search`, etc.) enumerated.
