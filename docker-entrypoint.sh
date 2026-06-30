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

# Seed base classes and link types (safe to re-run — uses upsert)
echo "==> Seeding base data"
php artisan db:seed --force --class=DatabaseSeeder 2>/dev/null || true

# Create admin user if ADMIN_EMAIL is set (safe to re-run — command skips if users exist)
if [ -n "$ADMIN_EMAIL" ]; then
    echo "==> Creating admin user: $ADMIN_EMAIL"

    # If ADMIN_PASSWORD is not set, let the command auto-generate one
    if [ -n "$ADMIN_PASSWORD" ]; then
        php artisan factology:install-admin \
            --email="$ADMIN_EMAIL" \
            --name="${ADMIN_NAME:-Admin}" \
            --password="$ADMIN_PASSWORD" \
            --no-interaction
    else
        php artisan factology:install-admin \
            --email="$ADMIN_EMAIL" \
            --name="${ADMIN_NAME:-Admin}" \
            --password=auto \
            --no-interaction
    fi
fi

# Production cache
echo "==> Caching config, routes, views"
php artisan config:cache 2>/dev/null || true
php artisan route:cache  2>/dev/null || true
php artisan view:cache   2>/dev/null || true

# Ensure storage is writable by the Apache user (entrypoint runs as root,
# but Apache runs as www-data). Without this, Laravel logging fails silently
# and returns HTTP 500 with no log entries.
chown -R www-data:www-data storage bootstrap/cache

echo "==> Ready"

exec "$@"
