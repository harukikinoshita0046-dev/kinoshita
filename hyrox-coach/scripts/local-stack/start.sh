#!/usr/bin/env bash
# Docker-free local Supabase stack: Postgres + Supabase Auth + PostgREST + gateway.
# Use this when `supabase start` (Docker) is not available. Ports and keys match
# the Supabase CLI defaults, so .env.local works with either setup.
#
#   API      http://127.0.0.1:54321   (/auth/v1, /rest/v1)
#   DB       postgresql://postgres:postgres@127.0.0.1:54322/postgres
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STACK_DIR="$PROJECT_DIR/.local-stack"
BIN_DIR="$STACK_DIR/bin"
RUN_DIR="$STACK_DIR/run"
LOG_DIR="$STACK_DIR/logs"
PGDATA="$STACK_DIR/pgdata"

AUTH_VERSION="${AUTH_VERSION:-v2.197.0}"
POSTGREST_VERSION="${POSTGREST_VERSION:-v14.5}"
DB_PORT=54322
AUTH_PORT=9999
REST_PORT=3001
GATEWAY_PORT=54321
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
SITE_URL="${SITE_URL:-http://localhost:3000}"

mkdir -p "$BIN_DIR" "$RUN_DIR" "$LOG_DIR"

# --- binaries ---------------------------------------------------------------
if [ ! -x "$BIN_DIR/auth/auth" ]; then
  echo "Downloading Supabase Auth $AUTH_VERSION..."
  mkdir -p "$BIN_DIR/auth"
  curl -fsSL "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" \
    | tar -xz -C "$BIN_DIR/auth"
fi
if [ ! -x "$BIN_DIR/postgrest" ]; then
  echo "Downloading PostgREST $POSTGREST_VERSION..."
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" \
    | tar -xJ -C "$BIN_DIR"
fi

# --- postgres ---------------------------------------------------------------
PG_BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/pg_ctl | sort -V | tail -1)")"
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}
if [ "$(id -u)" = "0" ]; then chown -R postgres "$STACK_DIR"; fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "Initializing Postgres cluster..."
  as_pg "$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >"$LOG_DIR/initdb.log"
fi
if ! as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$LOG_DIR/postgres.log" -w \
    -o "-p $DB_PORT -k $RUN_DIR -c listen_addresses=127.0.0.1 -c timezone=UTC" start >/dev/null
fi
export PGPASSWORD=postgres
psql_db() { psql -h 127.0.0.1 -p "$DB_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_db -f "$SCRIPT_DIR/bootstrap.sql" >/dev/null
psql_db -c "alter role postgres with password 'postgres'" >/dev/null

is_running() { [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; }
wait_for() {
  for _ in $(seq 1 60); do
    if curl -fsS "$1" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  echo "Timed out waiting for $1" >&2
  return 1
}

# --- supabase auth ----------------------------------------------------------
if ! is_running auth; then
  (
    cd "$BIN_DIR/auth"
    env \
      GOTRUE_API_HOST=127.0.0.1 PORT="$AUTH_PORT" \
      API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1" \
      GOTRUE_DB_DRIVER=postgres \
      DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$DB_PORT/postgres" \
      GOTRUE_SITE_URL="$SITE_URL" \
      GOTRUE_URI_ALLOW_LIST="$SITE_URL/**" \
      GOTRUE_DISABLE_SIGNUP=false \
      GOTRUE_JWT_ADMIN_ROLES=service_role \
      GOTRUE_JWT_AUD=authenticated \
      GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
      GOTRUE_JWT_EXP=3600 \
      GOTRUE_JWT_SECRET="$JWT_SECRET" \
      GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
      GOTRUE_MAILER_AUTOCONFIRM=true \
      GOTRUE_EXTERNAL_PHONE_ENABLED=false \
      GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
      nohup ./auth >"$LOG_DIR/auth.log" 2>&1 &
    echo $! >"$RUN_DIR/auth.pid"
  )
fi
wait_for "http://127.0.0.1:$AUTH_PORT/health"

# --- postgrest --------------------------------------------------------------
cat >"$STACK_DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$DB_PORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
EOF
if ! is_running postgrest; then
  nohup "$BIN_DIR/postgrest" "$STACK_DIR/postgrest.conf" >"$LOG_DIR/postgrest.log" 2>&1 &
  echo $! >"$RUN_DIR/postgrest.pid"
fi
wait_for "http://127.0.0.1:$REST_PORT/"

# --- gateway ----------------------------------------------------------------
if ! is_running gateway; then
  GATEWAY_PORT=$GATEWAY_PORT AUTH_PORT=$AUTH_PORT REST_PORT=$REST_PORT \
    nohup node "$SCRIPT_DIR/gateway.mjs" >"$LOG_DIR/gateway.log" 2>&1 &
  echo $! >"$RUN_DIR/gateway.pid"
fi
wait_for "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health"

cat <<EOF

Local Supabase stack is running.
  API URL:          http://127.0.0.1:$GATEWAY_PORT
  DB URL:           postgresql://postgres:postgres@127.0.0.1:$DB_PORT/postgres
  anon key:         eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
  service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
Logs: $LOG_DIR
EOF
