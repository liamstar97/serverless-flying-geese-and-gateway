#!/usr/bin/env python3
"""Patch the upstream ecommerce seed.

The upstream seed_data.py only successfully populates `catalog.products`
(20 rows). It tries to seed suppliers but calls SupplierDatabase
.create_supplier(**dict) where each dict has `id=...` — but the method's
signature uses `supplier_id=...`, so every call raises and gets swallowed
by the seed's broad try/except. Net result: empty suppliers table.

Inventory is already implicitly populated because the inventory service
reads from catalog.products.stock_quantity (no separate stock table).
Cart and orders are fine staying empty — those get populated through
agent use.
"""
from __future__ import annotations
import sys
from pathlib import Path

DATA_DIR = Path("/data")

sys.path.insert(0, "/app")

from mcp_tools.supplier_service.database import SupplierDatabase  # noqa: E402

SUPPLIERS = [
    ("sup-001", "TechSource Global",        5,  0.95, "orders@techsource.example.com"),
    ("sup-002", "HomeGoods Direct",         7,  0.88, "supply@homegoods.example.com"),
    ("sup-003", "SportsWare International", 10, 0.82, "fulfillment@sportsware.example.com"),
    ("sup-004", "Premium Distributors",     3,  0.98, "orders@premiumdist.example.com"),
    ("sup-005", "Value Wholesale Co",      14,  0.70, "info@valuewholesale.example.com"),
]


def main() -> None:
    db = SupplierDatabase(DATA_DIR)
    n = 0
    for sid, name, lt, score, email in SUPPLIERS:
        if db.get_supplier(sid):
            continue
        db.create_supplier(
            supplier_id=sid,
            name=name,
            lead_time_days=lt,
            reliability_score=score,
            contact_email=email,
        )
        n += 1
    print(f"  + {n} supplier(s)")


if __name__ == "__main__":
    main()
