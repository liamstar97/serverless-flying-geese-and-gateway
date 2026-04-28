#!/bin/bash
set -e

# Seed databases on first boot. /app/data is symlinked to /data (the volume).
if [ ! -f /app/data/entities.db ] || [ ! -f /app/data/categories.db ] || [ ! -f /app/data/tags.db ]; then
    echo "Seeding databases on first boot..."
    /app/.venv/bin/python /app/data/seed_data.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
