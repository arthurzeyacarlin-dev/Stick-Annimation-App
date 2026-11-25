# Diamond Animator — one container: the app (Next.js on Node 24) + the AI Animator engine's Python 3.9 (CPU only).
# Built ON THE SERVER from this repo:  docker compose -f deploy/docker-compose.yml build
# The engine's own code is NOT baked in: it is a folder on the server (/srv/diamond/engine, copied by deploy/engine-sync.sh),
# because it holds the fal key file and writes its spend ledgers. Accounts live in /srv/diamond/data (backed up nightly).

FROM node:24.13.1-bookworm-slim AS node

# ---- build the app (Linux build of better-sqlite3 included) ----
FROM python:3.9-slim-bookworm AS build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Fixed when the app is built (not secret): where the project store is (set by docker-compose.yml) and the AI Animator switch.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_DIAMOND_V1_ANIMATOR=1
ENV NEXT_TELEMETRY_DISABLED=1
# --webpack: the same builder the app has always been tested with (next dev --webpack).
# The build loads the sign-in code, which needs an account folder: a throwaway one is made for the build and deleted right
# after (the real one is the server's /srv/diamond/data, made by deploy/start.sh on the first start). Found Nov 25: without
# it a fresh server cannot build. All packages are kept (the sign-in table tool "auth" is a developer package).
RUN node scripts/spec0015-account/phase3/prepare-local-store.mjs && node_modules/.bin/auth migrate --config src/lib/account/auth.ts --yes \
 && npx next build --webpack && rm -rf .local

# ---- the running server ----
FROM python:3.9-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY deploy/requirements-engine.txt /tmp/requirements-engine.txt
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 fontconfig fonts-dejavu-core tini \
 && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir -r /tmp/requirements-engine.txt && useradd -m -u 1000 diamond
WORKDIR /app
COPY --from=build --chown=diamond:diamond /app /app
USER diamond
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
    DIAMOND_ENGINE_ROOT=/srv/engine DIAMOND_V1_PYTHON=/usr/local/bin/python
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/sh", "deploy/start.sh"]
