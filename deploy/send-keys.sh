#!/bin/bash
# (Nov 25) Copies the app's SECRET keys from this Mac straight into the server's settings, so nobody pastes keys by hand.
# Run by ARTHUR (or dad) in Terminal, never by Claude: Claude never sees a key. It prints only the NAMES it sent or could not find.
# Usage: deploy/send-keys.sh root@<server address>        (after deploy/server-setup.sh and deploy/engine-sync.sh)
# Where the keys come from (the same files the live app on this Mac uses today):
#   money-main/.env.production.local      Sonnet (Anthropic), OpenAI (Help assistant + dictation), Stripe
#   live-store/.resend-key                password emails (Resend)
#   live-store/.stripe-webhook-secret     the payments doorbell (optional: payments work without it)
#   diamond-engine/.env.local             the animator's fal key (FAL_KEY), written to the engine folder on the server
set -euo pipefail
SERVER="${1:?usage: deploy/send-keys.sh root@<server address>}"
R="${DIAMOND_REVIEW:-/Users/arthurcarlin/Projects/diamond-review}"
ENVF="$R/money-main/.env.production.local"; L="$R/live-store"; FALF="$R/diamond-engine/.env.local"
pick() { grep -E "^$1=" "$ENVF" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
lines=""; sent=""; missing=""
for n in ANTHROPIC_API_KEY OPENAI_API_KEY STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY FAL_ADMIN_KEY; do
  v="$(pick "$n")"
  if [ -z "$v" ] && [ "$n" = STRIPE_PUBLISHABLE_KEY ]; then v="$(pick NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)"; fi
  if [ -n "$v" ]; then lines+="$n=$v"$'\n'; sent+="$n "; else missing+="$n "; fi
done
if [ -s "$L/.resend-key" ]; then lines+="RESEND_API_KEY=$(tr -d ' \n\r' < "$L/.resend-key")"$'\n'; sent+="RESEND_API_KEY "; else missing+="RESEND_API_KEY "; fi
if [ -s "$L/.stripe-webhook-secret" ]; then lines+="STRIPE_WEBHOOK_SECRET=$(tr -d ' \n\r' < "$L/.stripe-webhook-secret")"$'\n'; sent+="STRIPE_WEBHOOK_SECRET "; fi
# the settings file on the server: these names are replaced, every other line (the store key, the switches) is kept
printf '%s' "$lines" | ssh "$SERVER" 'umask 077; f=/srv/diamond/settings.env; touch "$f"; new=$(mktemp); cat > "$new"
  names=$(cut -d= -f1 "$new" | paste -sd"|" -); { grep -vE "^(${names})=" "$f" || true; cat "$new"; } > "$f.tmp"; mv "$f.tmp" "$f"; chmod 600 "$f"; rm -f "$new"'
# the animator's fal key file
if grep -q '^FAL_KEY=' "$FALF" 2>/dev/null; then
  grep '^FAL_KEY=' "$FALF" | tail -1 | ssh "$SERVER" 'umask 077; mkdir -p /srv/diamond/engine/diamond-engine; cat > /srv/diamond/engine/diamond-engine/.env.local; chown -R 1000:1000 /srv/diamond/engine/diamond-engine'
  sent+="FAL_KEY(engine) "
else missing+="FAL_KEY(engine) "; fi
echo "Sent to the server: ${sent:-nothing}"
echo "Not found on this Mac: ${missing:-none}"
