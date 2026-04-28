"""Patched HTTP runner: same as upstream but disables FastMCP's
auto-enabled DNS-rebinding protection.

Why: FastMCP turns on host/origin validation when bound to localhost (the
default), which makes it 421 every request agentgateway proxies to it
(the gateway preserves the inbound `Host: localhost:3000` and the backend
considers `localhost:3000` not in its allowed-hosts list `[127.0.0.1:*,
localhost:*, [::1]:*]`). For our trusted-network bundle there is no DNS
rebinding threat, so we turn it off entirely.
"""

import argparse
import asyncio
import logging
import signal
import sys

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

logger = logging.getLogger(__name__)


def run_http_server(mcp: FastMCP, default_port: int = 8000):
    parser = argparse.ArgumentParser(description=f"Run {mcp.name} MCP Server")
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    mcp.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=False
    )

    logger.info(f"Starting {mcp.name} on {args.host}:{args.port}")

    app = mcp.streamable_http_app()
    config = uvicorn.Config(app, host=args.host, port=args.port, log_level="info")
    server = uvicorn.Server(config)

    def handle_shutdown(signum, frame):
        logger.info("Shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    asyncio.run(server.serve())
