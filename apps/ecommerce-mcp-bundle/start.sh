#!/bin/bash
set -e

# Seed databases on first boot. /app/data is symlinked to /data (the volume).
if [ ! -f /app/data/catalog.db ] || [ ! -f /app/data/cart.db ] || [ ! -f /app/data/order.db ] \
   || [ ! -f /app/data/inventory.db ] || [ ! -f /app/data/supplier.db ]; then
    echo "Seeding ecommerce databases on first boot..."
    /app/.venv/bin/python /app/scripts/seed_data.py
fi

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/services.conf
