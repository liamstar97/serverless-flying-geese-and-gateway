#!/bin/bash
set -e

# Same logic as research-mcp-bundle: re-seed if any DB is missing or empty.
needs_seed=0
declare -A counts=( [catalog]=products [cart]=cart_items [order]=orders [inventory]=inventory_items [supplier]=suppliers )
for f in catalog cart order inventory supplier; do
    p=/app/data/${f}.db
    if [ ! -f "$p" ]; then needs_seed=1; break; fi
done

# Only deep-check the two that the seed actually populates.
if [ "$needs_seed" = "0" ]; then
    rows=$(/app/.venv/bin/python - <<'EOF'
import sqlite3
n = 0
try:
    n += sqlite3.connect("/app/data/catalog.db").execute("SELECT COUNT(*) FROM products").fetchone()[0]
except Exception: pass
try:
    n += sqlite3.connect("/app/data/supplier.db").execute("SELECT COUNT(*) FROM suppliers").fetchone()[0]
except Exception: pass
print(n)
EOF
)
    if [ "$rows" = "0" ]; then needs_seed=1; fi
fi

if [ "$needs_seed" = "1" ]; then
    echo "Seeding ecommerce databases..."
    rm -f /app/data/*.db /app/data/*.db-*
    cp /app/scripts/seed_data.py /app/data/seed_data.py
    /app/.venv/bin/python /app/data/seed_data.py
    rm -f /app/data/seed_data.py
    # Patch step: upstream seed silently fails to create suppliers because
    # of a kwargs mismatch. Run our own.
    /app/.venv/bin/python /app/scripts/extra_seed.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
