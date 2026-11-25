#!/bin/bash
# (Nov 25) MOVING DAY: copies every account (sign-ins, plans, credits, usage, problem reports, the sign-in secret) and every saved
# project from the live app on this Mac to the server, so nobody's account or project changes. Run it ONLY right after the Mac's
# live app is stopped (anything saved on the Mac after the copy would not be on the server). Nothing on the Mac is changed or deleted.
# Usage: deploy/move-accounts.sh root@<server address>      (after server-setup.sh, before the app is started on the server)
set -euo pipefail
SERVER="${1:?usage: deploy/move-accounts.sh root@<server address>}"
R="${DIAMOND_REVIEW:-/Users/arthurcarlin/Projects/diamond-review}"
A="$R/money-main/.local/spec0015-phase3"; P="$R/live-store"
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then echo "STOP: the Mac's live app is still running (port 3000). Stop it first."; exit 1; fi
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; mkdir -p "$T/spec0015-phase3"
for f in "$A"/*.sqlite; do sqlite3 "$f" ".backup '$T/spec0015-phase3/$(basename "$f")'"; done   # a whole, safe copy of each database
cp -p "$A/auth-secret" "$T/spec0015-phase3/"                                                    # so everyone stays signed in
sqlite3 "$P/projects.sqlite" ".backup '$T/projects.sqlite'"
ssh "$SERVER" 'mkdir -p /srv/diamond/data/spec0015-phase3 /srv/diamond/projects/files'
rsync -a "$T/spec0015-phase3/" "$SERVER":/srv/diamond/data/spec0015-phase3/
rsync -a "$T/projects.sqlite" "$SERVER":/srv/diamond/projects/projects.sqlite
rsync -a "$P/files/" "$SERVER":/srv/diamond/projects/files/
ssh "$SERVER" 'chown -R 1000:1000 /srv/diamond/data /srv/diamond/projects && echo "On the server: $(ls /srv/diamond/data/spec0015-phase3 | wc -l) account files, $(find /srv/diamond/projects/files -type f | wc -l) project files"'
echo "On the Mac:    $(ls "$T/spec0015-phase3" | wc -l) account files, $(find "$P/files" -type f | wc -l) project files"
