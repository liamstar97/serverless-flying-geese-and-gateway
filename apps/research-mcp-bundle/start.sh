#!/bin/bash
set -e

# Re-seed if any DB is missing OR empty. The MCP services create empty
# schemas on startup, so a "exists but no rows" file is the most common
# failure mode after a stale partial seed.
needs_seed=0
for f in entities categories tags; do
    p=/app/data/${f}.db
    if [ ! -f "$p" ]; then needs_seed=1; break; fi
    rows=$(/app/.venv/bin/python - <<EOF
import sqlite3
c = sqlite3.connect("$p")
try:
    n = c.execute("SELECT COUNT(*) FROM ${f}").fetchone()[0]
except Exception:
    n = 0
print(n)
EOF
)
    if [ "$rows" = "0" ]; then needs_seed=1; break; fi
done

if [ "$needs_seed" = "1" ]; then
    echo "Seeding research databases..."
    # The upstream seed_data.py uses `data_dir = Path(__file__).parent`, so
    # writes land wherever the script is. Drop a copy into /app/data (which
    # is symlinked to the /data volume) so the seed lands on the volume.
    rm -f /app/data/*.db /app/data/*.db-*
    cp /app/scripts/seed_data.py /app/data/seed_data.py
    /app/.venv/bin/python /app/data/seed_data.py
    rm -f /app/data/seed_data.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
