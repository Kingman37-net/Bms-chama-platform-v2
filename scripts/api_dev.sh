#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/api"

if [ ! -f "bodmas.db" ]; then
  echo "▶ No dev DB. Initializing..."
  bash "$ROOT/scripts/api_init_db.sh"
fi

echo "▶ Starting API on http://localhost:8000"
exec node --no-warnings app/main.js
