#!/bin/bash
# (Nov 26, dad's YES) OFF-SERVER BACKUP: every night, right after the server's own backup (cron.daily/diamond-backup), the
# backups folder (every account database + every saved project) is copied to a private DigitalOcean Spaces bucket and kept
# 30 days there. So even if the whole server is lost, accounts and projects come back from the bucket.
# Run ONCE on the server as root, AFTER the two key files exist (dad/Arthur send them from the Mac; nobody pastes a key):
#   /srv/diamond/.spaces-key-id      the Spaces access key ID
#   /srv/diamond/.spaces-key-secret  the Spaces secret
# Usage:  bash deploy/offsite-backup-setup.sh [bucket name, default diamond-app-backups] [region, default nyc3]
set -euo pipefail
BUCKET="${1:-diamond-app-backups}"; REGION="${2:-nyc3}"
ID_FILE=/srv/diamond/.spaces-key-id; SECRET_FILE=/srv/diamond/.spaces-key-secret
test -s "$ID_FILE" && test -s "$SECRET_FILE" || { echo "MISSING: $ID_FILE and/or $SECRET_FILE (send them from the Mac first)"; exit 1; }
chmod 600 "$ID_FILE" "$SECRET_FILE"
command -v rclone >/dev/null || { apt-get update -qq && apt-get install -y -qq rclone; }
mkdir -p /root/.config/rclone
umask 077
cat > /root/.config/rclone/rclone.conf <<EOF
[spaces]
type = s3
provider = DigitalOcean
access_key_id = $(tr -d ' \n\r' < "$ID_FILE")
secret_access_key = $(tr -d ' \n\r' < "$SECRET_FILE")
endpoint = ${REGION}.digitaloceanspaces.com
acl = private
EOF
cat > /etc/cron.daily/diamond-offsite <<EOF
#!/bin/bash
# runs after cron.daily/diamond-backup (alphabetical order): copy the night's backups off the server, keep 30 days there
set -e
rclone copy /srv/diamond/backups spaces:${BUCKET}/backups --transfers 4 --log-level ERROR
rclone delete spaces:${BUCKET}/backups --min-age 30d --log-level ERROR || true
date -u +%FT%TZ > /srv/diamond/backups/.last-offsite-ok
EOF
chmod +x /etc/cron.daily/diamond-offsite
# prove it now: one copy, then list what is in the bucket (names only)
/etc/cron.daily/diamond-offsite
echo "Off-server backup OK. In the bucket now: $(rclone lsf -R spaces:${BUCKET}/backups | wc -l) files"
