#!/bin/bash
set -e

# Re-seed if any DB is missing OR empty. The MCP services create empty
# schemas on startup, so a "exists but no rows" file is the most common
# failure mode after a stale partial seed.
#
# Note the table name per file isn't 1:1 with the filename — tags.db
# stores content rows in `content`, not `tags`. Earlier versions of
# this script checked `SELECT COUNT(*) FROM tags` which always errored
# and forced a re-seed on every restart, blocking uvicorn for ~2 min.

declare -A TABLES=([entities]=entities [categories]=categories [tags]=content)

needs_seed=0
for f in "${!TABLES[@]}"; do
    p=/app/data/${f}.db
    table=${TABLES[$f]}
    if [ ! -f "$p" ]; then needs_seed=1; break; fi
    rows=$(/app/.venv/bin/python - <<EOF
import sqlite3
try:
    n = sqlite3.connect("$p").execute("SELECT COUNT(*) FROM $table").fetchone()[0]
except Exception:
    n = 0
print(n)
EOF
)
    if [ "$rows" = "0" ]; then needs_seed=1; break; fi
done

if [ "$needs_seed" = "1" ]; then
    echo "Seeding research databases..."
    rm -f /app/data/*.db /app/data/*.db-*
    cp /app/scripts/seed_data.py /app/data/seed_data.py
    /app/.venv/bin/python /app/data/seed_data.py
    rm -f /app/data/seed_data.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
