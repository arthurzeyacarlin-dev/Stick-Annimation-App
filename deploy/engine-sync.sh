#!/bin/bash
# Copies the AI Animator engine's CODE from this Mac straight to the server (nothing is written on the Mac).
# Usage: deploy/engine-sync.sh root@<server address>
# Never copied: secret files (.env*, *key*), old animations (out/), the old H3 clip cache, Python venvs, videos, backups.
# The fal key file the engine reads (engine/diamond-engine/.env.local, one line FAL_KEY=...) is written on the server by dad.
# Measured Nov 25: ~810 MB, ~11,000 files.
set -euo pipefail
SERVER="${1:?usage: deploy/engine-sync.sh root@<server address>}"
SRC="${DIAMOND_ENGINE_SOURCE:-/Users/arthurcarlin/Projects/diamond-review}"
EXCLUDES=(--exclude='.env*' --exclude='*.env' --exclude='shared-keys*' --exclude='*secret*' --exclude='node_modules/' --exclude='.venv/'
  --exclude='/ltx-effects/out/' --exclude='/kimodo/live-cache/' --exclude='/kimodo/out/' --exclude='backups/' --exclude='*.mp4'
  --exclude='*.mov' --exclude='*.tgz' --exclude='.git/' --exclude='__pycache__/' --exclude='.next*/')
ssh "$SERVER" 'mkdir -p /srv/diamond/engine/diamond-engine /srv/diamond/engine/ltx-effects/out && chown -R 1000:1000 /srv/diamond/engine'
cd "$SRC"
# The four folders the engine uses (traced Nov 25 with a free cached run + its own path links):
rsync -az --info=stats1 "${EXCLUDES[@]}" ltx-effects kimodo kimodo-combo harness-phase4 "$SERVER":/srv/diamond/engine/
ssh "$SERVER" 'chown -R 1000:1000 /srv/diamond/engine && test -f /srv/diamond/engine/diamond-engine/.env.local || echo "STILL NEEDED: the fal key file /srv/diamond/engine/diamond-engine/.env.local (dad)"'
