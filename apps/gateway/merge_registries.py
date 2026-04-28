#!/usr/bin/env python3
"""Merge the research-assistant and ecommerce virtual-tool registries into one.

Both upstream registries are schemaVersion 2.0 with the same structure:
{schemas: [...], servers: [...], tools: [...], (agents: [...] - ecommerce only)}

Pre-flight: verified no name collisions between the two on schemas, servers,
or tools (see git history M2 for the check). If a future upstream change
introduces a collision, this script aborts with a clear error.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path


def _names(items: list[dict], key: str = "name") -> set[str]:
    return {it[key] for it in items if key in it}


def main(research_path: str, ecommerce_path: str, out_path: str) -> None:
    r = json.loads(Path(research_path).read_text())
    e = json.loads(Path(ecommerce_path).read_text())

    for section in ("schemas", "servers", "tools"):
        clash = _names(r.get(section, [])) & _names(e.get(section, []))
        if clash:
            sys.exit(f"name collision in {section}: {sorted(clash)}")

    merged = {
        "schemaVersion": "2.0",
        "description": "Merged registry: research-assistant + ecommerce demos",
        "schemas": [*r.get("schemas", []), *e.get("schemas", [])],
        "servers": [*r.get("servers", []), *e.get("servers", [])],
        "tools": [*r.get("tools", []), *e.get("tools", [])],
        "agents": e.get("agents", []),
    }

    Path(out_path).write_text(json.dumps(merged, indent=2))
    print(
        f"merged {len(merged['tools'])} tools / "
        f"{len(merged['servers'])} servers / "
        f"{len(merged['schemas'])} schemas -> {out_path}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: merge_registries.py <research> <ecommerce> <out>")
    main(*sys.argv[1:])
