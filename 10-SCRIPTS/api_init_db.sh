#!/usr/bin/env bash
# Rebuild the development database from schema + seeds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/api/bodmas.db"
SCHEMA="$ROOT/database/schema"
SEEDS="$ROOT/database/seeds"

echo "▶ Rebuilding dev DB at $DB"
rm -f "$DB" "$DB-shm" "$DB-wal"

echo "▶ Applying schema"
for f in "$SCHEMA"/*.sql; do
  echo "  - $(basename "$f")"
  sqlite3 "$DB" < "$f"
done

echo "▶ Applying seeds"
for f in "$SEEDS"/*.sql; do
  echo "  - $(basename "$f")"
  sqlite3 "$DB" < "$f"
done

echo "▶ Done."
sqlite3 "$DB" "SELECT COUNT(*) || ' tables' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
