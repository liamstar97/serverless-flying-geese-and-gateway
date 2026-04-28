# Bundles all 5 research MCP services in one container, supervised by
# supervisord. SQLite databases live on /data (volume mount).

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

# uv is the package manager the upstream demo uses; install it once.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Pull demo source straight from the vendored submodule. This avoids
# duplicating code into our repo and keeps the source of truth at the pinned
# upstream commit.
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/pyproject.toml ./pyproject.toml
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/mcp_tools ./mcp_tools
COPY vendor/agentgatewaygastown/examples/research-assistant-demo/data/seed_data.py ./data/seed_data.py

# Install only the runtime deps actually needed for the MCP services.
# (We skip google-adk and the rest of the agent stack — those aren't used
# inside the bundle.) The lock file isn't checked in upstream, so don't
# require it.
RUN uv venv && \
    uv pip install \
        'mcp>=1.3.0' 'pydantic>=2.0.0' 'sentence-transformers>=2.2.0' \
        'sqlite-vec>=0.1.1' 'aiosqlite>=0.19.0' 'httpx>=0.27.0' \
        'beautifulsoup4>=4.12.0' 'starlette>=0.37.0' 'uvicorn>=0.30.0' \
        'python-dotenv>=1.0.0'

# /data is the volume mount; symlink so the demo's relative `data/` paths land there.
# (db_utils.get_db_path resolves to <repo>/data; with /app as workdir that's /app/data.)
RUN rm -rf /app/data && ln -s /data /app/data

COPY apps/research-mcp-bundle/supervisord.conf /etc/supervisor/conf.d/services.conf
COPY apps/research-mcp-bundle/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8001 8002 8003 8004 8005
CMD ["/start.sh"]
