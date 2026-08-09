#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_FILE="$ROOT_DIR/project/project_structure.txt"

mkdir -p "$ROOT_DIR/project"

# Generate a deterministic, low-noise project structure snapshot.
# Exclude dependencies, build/browser artifacts, local service metadata,
# backups, logs, and every environment file except the key-only example.
find "$ROOT_DIR" \
  \( -path "$ROOT_DIR/.git" -o -path "$ROOT_DIR/node_modules" -o -path "$ROOT_DIR/.next" -o -path "$ROOT_DIR/.playwright-cli" -o -path "$ROOT_DIR/.local" -o -path "$ROOT_DIR/.vercel" -o -path "$ROOT_DIR/coverage" -o -path "$ROOT_DIR/output" -o -path "$ROOT_DIR/out" -o -path "$ROOT_DIR/dist" -o -path "$ROOT_DIR/build" -o -path "$ROOT_DIR/project/doc_backups" -o -path "$ROOT_DIR/supabase/.temp" \) -prune -o \
  \( -name '.DS_Store' -o -name '.pnp.*' -o -name '*.log' -o -name '*.pem' -o -name '*.tsbuildinfo' -o -name 'next-env.d.ts' \) -prune -o \
  \( -name '.env*' ! -name '.env.example' \) -prune -o \
  -print \
  | sed "s|^$ROOT_DIR|.|" \
  | LC_ALL=C sort > "$OUT_FILE"

echo "Wrote $OUT_FILE"
