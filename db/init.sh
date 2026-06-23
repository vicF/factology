#!/bin/bash
# ============================================================
#  PostgreSQL init script for production
#  Creates a restricted application user (not superuser).
#  Runs only once when the data volume is first created.
# ============================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE dbuser WITH LOGIN PASSWORD '${DB_PASSWORD}' NOINHERIT;
    GRANT CONNECT, CREATE ON DATABASE factology TO dbuser;
    GRANT USAGE, CREATE ON SCHEMA public TO dbuser;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dbuser;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dbuser;
EOSQL
