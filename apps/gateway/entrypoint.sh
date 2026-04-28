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

# Substitute hostnames into the gateway config.
envsubst '$RESEARCH_MCP_HOST $ECOMMERCE_MCP_HOST' \
    < /etc/agentgateway/config.yaml.tmpl \
    > /etc/agentgateway/config.yaml

# Run the registry-sync sidecar in the background. It accepts POSTs from
# the web app's /registry editor and writes /var/registry/registry.json
# atomically; agentgateway's `refreshInterval` then picks up the change.
python3 /usr/local/bin/registry_sync.py &

exec /usr/local/bin/agentgateway -f /etc/agentgateway/config.yaml
