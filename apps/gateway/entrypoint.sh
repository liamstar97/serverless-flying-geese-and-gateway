#!/bin/sh
set -e

# Substitute hostnames into the gateway config so the same image works for
# docker-compose (uses service names) and Fly (uses *.internal DNS).
envsubst '$RESEARCH_MCP_HOST $ECOMMERCE_MCP_HOST' \
    < /etc/agentgateway/config.yaml.tmpl \
    > /etc/agentgateway/config.yaml

exec /usr/local/bin/agentgateway -f /etc/agentgateway/config.yaml
