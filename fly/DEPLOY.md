# Deploying to Fly

Five Fly apps, all in `sea`:

| app                            | role                                | public? |
|--------------------------------|-------------------------------------|---------|
| `gloop-liam-research-mcp`      | 5 research MCP services             | no      |
| `gloop-liam-ecommerce-mcp`     | 5 ecommerce MCP services            | no      |
| `gloop-liam-gateway`           | agentgateway + admin UI             | no      |
| `gloop-liam-goose-runner`      | template app for ephemeral machines | no      |
| `gloop-liam-web`               | Next.js front door                  | yes     |

## Prereqs (one-time)

```bash
# 1. flyctl auth — confirm with: fly auth whoami
fly auth login

# 2. A second GitHub OAuth app for production (separate from local dev,
#    because GitHub allows only one callback per app).
#    Homepage:  https://gloop.imminentlatency.com
#    Callback:  https://gloop.imminentlatency.com/api/auth/callback/github

# 3. A Fly API token with Machines write access. From the dashboard or:
#    fly tokens create deploy --name gloop-machines-orchestrator
#    Save the value — it goes on the web app as FLY_API_TOKEN.
```

## Order of operations

```bash
# Always invoke flyctl from the repo root so the build context is correct.

# 1. Create + deploy the two MCP bundles. They get one Volume each, in sea.
fly apps create gloop-liam-research-mcp --org personal
fly volumes create research_data -a gloop-liam-research-mcp -r sea -s 1
fly deploy -c fly/research-mcp-bundle.fly.toml --vm-memory 1024

fly apps create gloop-liam-ecommerce-mcp --org personal
fly volumes create ecommerce_data -a gloop-liam-ecommerce-mcp -r sea -s 1
fly deploy -c fly/ecommerce-mcp-bundle.fly.toml --vm-memory 1024

# 2. Gateway. Volume holds the live registry (mounted into the web app
#    too — same `gateway_registry` name, but each app has its own.)
fly apps create gloop-liam-gateway --org personal
fly volumes create gateway_registry -a gloop-liam-gateway -r sea -s 1
fly deploy -c fly/gateway.fly.toml

# 3. goose-runner. Build-only — we never run an instance from this app's
#    fly.toml; the web app spawns Machines with the same image on demand.
fly apps create gloop-liam-goose-runner --org personal
fly deploy -c fly/goose-runner.fly.toml --build-only --push
# Capture the image digest for the web app:
GOOSE_IMAGE=$(fly image show -a gloop-liam-goose-runner --json | jq -r '.image_ref.digest')
echo "$GOOSE_IMAGE"
# Make a volume for shared recipes (ro-mounted into spawned machines):
fly volumes create goose_recipes -a gloop-liam-goose-runner -r sea -s 1

# 4. Web. Set secrets BEFORE first deploy so the build can finish.
fly apps create gloop-liam-web --org personal
fly volumes create web_data -a gloop-liam-web -r sea -s 1
fly secrets set -a gloop-liam-web \
  AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_GITHUB_ID="<production OAuth client id>" \
  AUTH_GITHUB_SECRET="<production OAuth client secret>" \
  ANTHROPIC_API_KEY="<your anthropic key>" \
  FLY_API_TOKEN="<deploy token from step (3) above>" \
  FLY_GOOSE_IMAGE="registry.fly.io/gloop-liam-goose-runner@$GOOSE_IMAGE" \
  FLY_RECIPES_VOLUME="goose_recipes"
fly deploy -c fly/web.fly.toml

# 5. Custom domain.
fly certs add gloop.imminentlatency.com -a gloop-liam-web
# Then at your DNS provider:
#   gloop.imminentlatency.com  CNAME  gloop-liam-web.fly.dev
# Wait ~30s, verify:
fly certs show gloop.imminentlatency.com -a gloop-liam-web
```

## Smoke test

```bash
# Every backend reachable from the gateway?
fly ssh console -a gloop-liam-gateway -C 'curl -sS -o /dev/null -w "%{http_code}\n" \
  http://gloop-liam-research-mcp.internal:8001/mcp -X POST \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"x\",\"version\":\"0\"}}}"'

# Web up, GitHub sign-in works, persona picker shows three personas.
open https://gloop.imminentlatency.com
```

## Tearing down

```bash
fly apps destroy gloop-liam-web --yes
fly apps destroy gloop-liam-goose-runner --yes
fly apps destroy gloop-liam-gateway --yes
fly apps destroy gloop-liam-ecommerce-mcp --yes
fly apps destroy gloop-liam-research-mcp --yes
```

## Caveats and TODOs

- **Recipes sync.** The web app writes `data/personas/<id>.yaml`, but
  spawned goose-runner machines mount their *own* volume on a different
  Fly app. Today the orchestrator passes the recipe file via env or
  expects the goose-runner image to embed defaults — for live recipe
  edits in production we need either (a) periodic rsync from web's
  volume to the goose-runner volume, (b) a tiny shared object store
  (Tigris bucket) the orchestrator pushes to and the wrapper pulls
  from, or (c) inline the recipe into the GOOSE_RECIPE env var.
  M5+ task.
- **Region pinning.** Both MCP bundles are stateful (SQLite on a Volume),
  so they live in `sea` only. Web is also pinned to `sea` for now —
  multi-region with goose machines spawned in the user's nearest region
  is M5++.
- **GitHub OAuth flow.** First deploy may 500 the callback if the OAuth
  app's callback URL doesn't exactly match (https vs http, www vs not).
  Use the production URL, not the cert preview URL.
