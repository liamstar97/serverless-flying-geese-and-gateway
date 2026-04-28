#!/bin/sh
set -e

# Seed the bind-mounted registry on first boot.
if [ ! -f /var/registry/registry.json ]; then
    echo "registry not found at /var/registry/registry.json — seeding from defaults"
    python3 /opt/registry-defaults/merge_registries.py \
        /opt/registry-defaults/research_registry.json \
        /opt/registry-defaults/ecommerce_registry.json \
        /var/registry/registry.json
fi

# Substitute hostnames into the gateway config so the same image works for
# docker-compose (uses service names) and Fly (uses *.internal DNS).
envsubst '$RESEARCH_MCP_HOST $ECOMMERCE_MCP_HOST' \
    < /etc/agentgateway/config.yaml.tmpl \
    > /etc/agentgateway/config.yaml

exec /usr/local/bin/agentgateway -f /etc/agentgateway/config.yaml
