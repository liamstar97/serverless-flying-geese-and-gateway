# Builds Jake Mannix's agentgateway fork (feature/tool-algebra-cleanup) from
# the vendored submodule. Dev/debug build — see CLAUDE.md in the upstream repo:
# release builds via `make build` are SLOW and only worth it for production.

FROM rust:1.91-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        clang lld pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CARGO_NET_GIT_FETCH_WITH_CLI=true \
    CC=clang \
    CXX=clang++

WORKDIR /app

# Copy only what's needed to build the binary (no UI, no examples, no tests).
COPY vendor/agentgatewaygastown/Cargo.toml vendor/agentgatewaygastown/Cargo.lock ./
COPY vendor/agentgatewaygastown/.cargo ./.cargo
COPY vendor/agentgatewaygastown/crates ./crates
COPY vendor/agentgatewaygastown/common ./common

RUN --mount=type=cache,id=cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=cargo-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=cargo-target,target=/app/target \
    cargo build -p agentgateway-app && \
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

# Merge the two upstream virtual-tool registries into one /etc/agentgateway/registry.json
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY apps/gateway/merge_registries.py /tmp/merge_registries.py
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/gateway-configs/research_registry.json \
     /tmp/research_registry.json
COPY vendor/agentgatewaygastown/examples/ecommerce-demo/gateway-configs/ecommerce_registry_v2.json \
     /tmp/ecommerce_registry.json
RUN python3 /tmp/merge_registries.py /tmp/research_registry.json /tmp/ecommerce_registry.json /etc/agentgateway/registry.json \
    && rm /tmp/merge_registries.py /tmp/research_registry.json /tmp/ecommerce_registry.json

# Hostnames default to docker-compose service names; override on Fly via env.
ENV RESEARCH_MCP_HOST=research-mcp-bundle \
    ECOMMERCE_MCP_HOST=ecommerce-mcp-bundle

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
