#!/bin/sh
# ================================================================
#  Production entrypoint — runs once at container start
#  Handles: key generation, migrations, caching
# ================================================================
set -e

cd /var/www/html

# If .env doesn't exist, create it from .env.example
if [ ! -f .env ]; then
    echo "==> Creating .env from .env.example"
    cp .env.example .env
    sed -i 's|^APP_ENV=.*|APP_ENV=production|' .env
    sed -i 's|^APP_DEBUG=.*|APP_DEBUG=false|' .env
    sed -i 's|^DB_HOST=.*|DB_HOST=postgres|' .env
    sed -i 's|^DB_PORT=.*|DB_PORT=5432|' .env
    sed -i 's|^DB_CONNECTION=.*|DB_CONNECTION=pgsql|' .env
fi

# Generate APP_KEY if empty or placeholder
APP_KEY=$(grep -oP '^APP_KEY=\K.*' .env 2>/dev/null || true)
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "***" ] || [ "$APP_KEY" = " " ]; then
    echo "==> Generating APP_KEY"
    php artisan key:generate --force
fi

# Run pending migrations
echo "==> Running database migrations"
php artisan migrate --force

# Production cache
echo "==> Caching config, routes, views"
php artisan config:cache 2>/dev/null || true
php artisan route:cache  2>/dev/null || true
php artisan view:cache   2>/dev/null || true

echo "==> Ready"

exec "$@"
