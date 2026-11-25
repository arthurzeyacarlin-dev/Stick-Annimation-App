#!/bin/sh
# The container's start (Nov 25). Every start:
#  1. the account folder (/app/.local = the server's /srv/diamond/data) gets its sign-in secret ONCE (an existing one is never
#     replaced, so nobody is ever signed out by a restart) - the project's own setup step;
#  2. the sign-in tables are created if missing (an existing database only gets missing tables; nothing is removed);
#  3. the app starts.
set -e
cd /app
node scripts/spec0015-account/phase3/prepare-local-store.mjs
node_modules/.bin/auth migrate --config src/lib/account/auth.ts --yes
exec node_modules/.bin/next start -p 3000 -H 0.0.0.0
