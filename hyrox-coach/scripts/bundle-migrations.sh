#!/usr/bin/env bash
# Bundles supabase/migrations into one file for the Supabase Dashboard SQL Editor
# (for when the Supabase CLI can't reach the hosted database).
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/setup-hosted.sql
files=(supabase/migrations/*.sql)
{
  echo "-- HYROX AI Coach: hosted Supabase setup (generated from supabase/migrations — do not edit)."
  echo "-- Paste the whole file into Supabase Dashboard -> SQL Editor -> Run, once, on an empty project."
  echo "-- It also records the migrations so a later \`supabase db push\` skips them."
  echo "-- Regenerate with: npm run db:bundle"
  echo
  for f in "${files[@]}"; do
    echo "-- ===== $(basename "$f") ====="
    cat "$f"
    echo
  done
  echo "-- ===== migration history ====="
  echo "create schema if not exists supabase_migrations;"
  echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
  echo "insert into supabase_migrations.schema_migrations (version, name) values"
  n=${#files[@]}
  for i in "${!files[@]}"; do
    base=$(basename "${files[$i]}" .sql)
    sep=","; [ "$i" -eq $((n - 1)) ] && sep=""
    echo "  ('${base%%_*}', '${base#*_}')$sep"
  done
  echo "on conflict (version) do nothing;"
} > "$out"
echo "wrote $out"
