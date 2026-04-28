# Builds Jake Mannix's agentgateway fork (feature/tool-algebra-cleanup) from
# the vendored submodule, with the admin UI embedded via --features ui.
# Dev/debug build — see CLAUDE.md in the upstream repo: release builds are slow.

# ---------- stage 1: build the Next.js UI to a static export ----------
FROM node:23-bookworm-slim AS ui

WORKDIR /ui
COPY vendor/agentgatewaygastown/ui/ ./
RUN --mount=type=cache,target=/root/.npm npm ci
RUN npm run build
# next.config.ts has `output: "export"` -> /ui/out

# ---------- stage 2: build the Rust binary, embedding the UI ----------
FROM rust:1.91-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        clang lld pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CARGO_NET_GIT_FETCH_WITH_CLI=true \
    CC=clang \
    CXX=clang++

WORKDIR /app

COPY vendor/agentgatewaygastown/Cargo.toml vendor/agentgatewaygastown/Cargo.lock ./
COPY vendor/agentgatewaygastown/.cargo ./.cargo
COPY vendor/agentgatewaygastown/crates ./crates
COPY vendor/agentgatewaygastown/common ./common
# The gateway binary's --features ui embeds /ui/out at compile time.
COPY --from=ui /ui/out ./ui/out

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=cargo-target,target=/app/target \
    cargo build -p agentgateway-app --features agentgateway/ui && \
    cp /app/target/debug/agentgateway /agentgateway

# ---------- runtime image ----------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /agentgateway /usr/local/bin/agentgateway
COPY apps/gateway/config.yaml.tmpl /etc/agentgateway/config.yaml.tmpl
COPY apps/gateway/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Stash the merge script + source registries inside the image. entrypoint.sh
# uses these to seed /var/registry/registry.json on first boot if the
# bind-mounted host volume is empty. After that the host file is the source
# of truth — the gateway hot-reloads it on a 30s interval, so the web app's
# /registry editor takes effect within that window.
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/registry /opt/registry-defaults
COPY apps/gateway/merge_registries.py /opt/registry-defaults/merge_registries.py
COPY apps/gateway/registry_sync.py /usr/local/bin/registry_sync.py
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/gateway-configs/research_registry.json \
     /opt/registry-defaults/research_registry.json
COPY vendor/agentgatewaygastown/examples/ecommerce-demo/gateway-configs/ecommerce_registry_v2.json \
     /opt/registry-defaults/ecommerce_registry.json

# Hostnames default to docker-compose service names; override on Fly via env.
ENV RESEARCH_MCP_HOST=research-mcp-bundle \
    ECOMMERCE_MCP_HOST=ecommerce-mcp-bundle \
    ADMIN_ADDR=0.0.0.0:15000

EXPOSE 3000 15000 15001
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
