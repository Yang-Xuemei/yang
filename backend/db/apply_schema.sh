#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read DATABASE_PATH from .env (allowlisted)
DB_PATH="data/app.sqlite3"
if [ -f "$BACKEND_DIR/.env" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      DATABASE_PATH) DB_PATH="$value" ;;
    esac
  done < "$BACKEND_DIR/.env"
fi

# Strip quotes
DB_PATH="${DB_PATH%\"}"
DB_PATH="${DB_PATH#\"}"

if [[ "$DB_PATH" != /* ]]; then
  DB_PATH="$BACKEND_DIR/$DB_PATH"
fi

mkdir -p "$(dirname "$DB_PATH")"

# Use Python to apply schema (sqlite3 CLI may not be available)
python3 -c "
import sqlite3, os
db_path = '$DB_PATH'
schema_file = '$SCRIPT_DIR/schema.sql'
seed_file = '$SCRIPT_DIR/seed.sql'
conn = sqlite3.connect(db_path)
conn.execute('PRAGMA foreign_keys = ON')
with open(schema_file, 'r', encoding='utf-8') as f:
    conn.executescript(f.read())
# Seed if warehouses empty
cur = conn.execute('SELECT COUNT(*) FROM warehouses')
count = cur.fetchone()[0]
if count == 0 and os.path.exists(seed_file):
    with open(seed_file, 'r', encoding='utf-8') as f:
        conn.executescript(f.read())
conn.commit()
conn.close()
print('SQLite schema applied', flush=True)
"
