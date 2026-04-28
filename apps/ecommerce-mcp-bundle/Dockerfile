# Bundles all 5 ecommerce MCP services in one container, supervised by
# supervisord. SQLite databases live on /data (volume mount).
#
# Differs from research-mcp-bundle in two ways:
#   1. Services are launched via `python -m mcp_tools.<svc>_service.server`
#      (no port arg — port is baked into the FastMCP() constructor in each
#      server.py).
#   2. Services already pass host="0.0.0.0" to FastMCP, which sidesteps
#      FastMCP's auto-DNS-rebinding-protection (it only triggers when
#      bound to localhost). So no patched http_runner.py is needed here.

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY vendor/agentgatewaygastown/examples/ecommerce-demo/pyproject.toml ./pyproject.toml
COPY vendor/agentgatewaygastown/examples/ecommerce-demo/mcp_tools ./mcp_tools
# Same trick as research bundle: seed script lives at /app/scripts/ so its
# sys.path manipulation (parent.parent) still resolves to /app where mcp_tools/ is.
COPY vendor/agentgatewaygastown/examples/ecommerce-demo/data/seed_data.py /app/scripts/seed_data.py

# Install only runtime deps for the MCP services. Skip the agent-side stuff
# (google-adk, langgraph, langchain-*) — those run in goose machines, not here.
RUN uv venv && \
    uv pip install \
        'mcp>=1.0.0' 'pydantic>=2.0.0' 'sentence-transformers>=2.2.0' \
        'sqlite-vec>=0.1.1' 'httpx>=0.27.0' 'starlette>=0.37.0' \
        'uvicorn>=0.30.0'

# /app/data → /data (volume) so upstream's relative `data/` lookups land there.
RUN rm -rf /app/data && ln -s /data /app/data

COPY apps/ecommerce-mcp-bundle/extra_seed.py /app/scripts/extra_seed.py
COPY apps/ecommerce-mcp-bundle/supervisord.conf /etc/supervisor/conf.d/services.conf
COPY apps/ecommerce-mcp-bundle/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8001 8002 8003 8004 8005
CMD ["/start.sh"]
