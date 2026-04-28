# Multi-stage Next.js build using standalone output. Final image is small
# (~200 MB) — just node + the .next/standalone server.

FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 needs python + a C++ toolchain at install time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/web/package.json apps/web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY apps/web/ ./
# Bundle the upstream registry JSONs so lib/registry.ts can seed without
# needing python or the vendored submodule at runtime.
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/gateway-configs/research_registry.json ./seeds/research_registry.json
COPY vendor/agentgatewaygastown/examples/ecommerce-demo/gateway-configs/ecommerce_registry_v2.json ./seeds/ecommerce_registry_v2.json
# Bundle the default goose recipes so persona-store can seed data/personas/
# on first read. (The goose-runner image carries its own copy too, but the
# web app reads/writes a separate Volume.)
COPY apps/goose-runner/recipes ./seeds/recipes
COPY --from=deps /app/node_modules ./node_modules
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app

# Next.js standalone server (.next/standalone has only the deps the build
# detected as needed — `serverExternalPackages` plus the native bits
# below get hand-pulled).
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/seeds ./seeds
# (no public/ dir in this project — skip copying it)

# Where lib/persona-store looks for default recipes when seeding.
ENV GLOOP_DEFAULT_RECIPES_DIR=/app/seeds/recipes

# better-sqlite3 is server-external, so the standalone bundle doesn't
# include it. Hand-copy the prebuild + its top-level dep.
COPY --from=builder --chown=app:app /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=app:app /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=app:app /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Where the spawned goose-runner machines + sessions DB + persona files
# live. Bind-mounted from a Fly Volume in production.
RUN mkdir -p /data && chown app:app /data

USER app
EXPOSE 3001
CMD ["node", "server.js"]
