#!/bin/bash
set -e

# Re-seed only when the two tables seed_data.py + extra_seed.py actually
# populate (catalog.products, supplier.suppliers) are empty. The other
# DBs (cart, order, inventory) are created lazily by their MCP services
# on first request — we *don't* want to gate on their file existence,
# because the previous re-seed path's `rm -f /app/data/*.db` deleted
# them and forced an infinite re-seed loop on every restart.

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

if [ "$rows" = "0" ]; then
    echo "Seeding ecommerce databases..."
    rm -f /app/data/catalog.db /app/data/catalog.db-* \
          /app/data/supplier.db /app/data/supplier.db-*
    cp /app/scripts/seed_data.py /app/data/seed_data.py
    /app/.venv/bin/python /app/data/seed_data.py
    rm -f /app/data/seed_data.py
    # Patch step: upstream seed silently fails to create suppliers because
    # of a kwargs mismatch. Run our own.
    /app/.venv/bin/python /app/scripts/extra_seed.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
