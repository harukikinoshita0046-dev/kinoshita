#!/usr/bin/env bash
# Stops the Docker-free local Supabase stack started by start.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/.local-stack"
RUN_DIR="$STACK_DIR/run"

for svc in gateway postgrest auth; do
  if [ -f "$RUN_DIR/$svc.pid" ]; then
    kill "$(cat "$RUN_DIR/$svc.pid")" 2>/dev/null || true
    rm -f "$RUN_DIR/$svc.pid"
  fi
done

PG_BIN="$(dirname "$(command -v pg_ctl 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/pg_ctl | sort -V | tail -1)")"
if [ -f "$STACK_DIR/pgdata/PG_VERSION" ]; then
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$STACK_DIR/pgdata" stop -m fast >/dev/null 2>&1 || true
  else
    "$PG_BIN/pg_ctl" -D "$STACK_DIR/pgdata" stop -m fast >/dev/null 2>&1 || true
  fi
fi
echo "Local Supabase stack stopped."
