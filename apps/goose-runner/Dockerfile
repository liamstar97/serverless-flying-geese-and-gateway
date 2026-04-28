# Goose runner image — extends the official goose CLI with a thin FastAPI
# WebSocket wrapper that exec's `goose run` per chat message and streams
# stream-json NDJSON lines back to the client.
#
# This image is what we'll spawn as ephemeral Fly Machines in M5 (one per
# (user, persona, chat-session)). For local dev it can also be brought up
# from docker-compose.

FROM ghcr.io/block/goose:latest

# Goose's image runs as UID 1000 and uses /home/goose. Switch to root just
# long enough to install the wrapper deps.
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV WRAPPER_VENV=/opt/wrapper-venv
RUN python3 -m venv $WRAPPER_VENV && \
    $WRAPPER_VENV/bin/pip install --no-cache-dir \
        'fastapi==0.115.*' 'uvicorn[standard]==0.32.*' 'websockets>=12' 'pyyaml>=6'

COPY apps/goose-runner/wrapper/ /opt/wrapper/
COPY apps/goose-runner/recipes/ /etc/goose-recipes/

# Picked at container start via env GOOSE_RECIPE (research|customer|merchandiser).
ENV GOOSE_RECIPE=research \
    GOOSE_PROVIDER=anthropic \
    GOOSE_MODEL=claude-sonnet-4-6

# Goose's default keyring won't work in containers; force passing key as env.
# (Set ANTHROPIC_API_KEY at runtime — never bake it in.)

EXPOSE 8000

USER 1000
# Bind to "::" so uvicorn accepts both IPv4 (Docker on macOS) and IPv6
# (Fly's 6PN). With "0.0.0.0" the machine ECONNREFUSES on its private
# v6 IP, which is the only thing other Fly machines can reach.
ENTRYPOINT ["/opt/wrapper-venv/bin/python", "-m", "uvicorn", "main:app", \
            "--app-dir", "/opt/wrapper", "--host", "::", "--port", "8000"]
