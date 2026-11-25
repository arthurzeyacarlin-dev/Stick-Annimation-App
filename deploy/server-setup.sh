#!/bin/bash
# Run ONCE on a fresh DigitalOcean Ubuntu 24.04 server (4 vCPU / 8 GB), as root:  bash deploy/server-setup.sh
# Installs Docker, opens only the web ports + ssh, makes the folders, makes the project store's own secret key, and backs up
# the accounts AND every saved project every night (7 nights kept). Running it again changes nothing that exists.
set -euo pipefail
apt-get update
apt-get install -y ca-certificates curl git ufw sqlite3 rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /srv/diamond/data /srv/diamond/projects /srv/diamond/engine /srv/diamond/caddy /srv/diamond/backups
chown -R 1000:1000 /srv/diamond/data /srv/diamond/projects /srv/diamond/engine
touch /srv/diamond/settings.env && chmod 600 /srv/diamond/settings.env
# The project store's key: made here, once, never shown to anyone (the app and the store both read it from settings.env).
if ! grep -q '^STORE_KEY=' /srv/diamond/settings.env; then
  k=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')
  printf 'STORE_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$k" "$k" >> /srv/diamond/settings.env
fi
# (Nov 25) the switches that are not secret (every line of server-settings.example that already has a value) are written here, so
# nobody types them; a name already in settings.env is never changed. The secret keys come from deploy/send-keys.sh (run on the Mac).
grep -E '^[A-Z0-9_]+=.+' "$(dirname "$0")/server-settings.example" | while IFS= read -r line; do
  grep -q "^${line%%=*}=" /srv/diamond/settings.env || printf '%s\n' "$line" >> /srv/diamond/settings.env
done
# Nightly backup, 7 nights kept: a safe copy of every database (works while the app runs) + a snapshot of every project file
# (hard links: a file kept from the night before costs no extra space; a file deleted by the app stays in the backups 7 days).
cat > /etc/cron.daily/diamond-backup <<'EOF'
#!/bin/bash
set -e
d=/srv/diamond/backups/$(date +%F); mkdir -p "$d/accounts"
for f in /srv/diamond/data/spec0015-phase3/*.sqlite; do sqlite3 "$f" ".backup '$d/accounts/$(basename "$f")'"; done
sqlite3 /srv/diamond/projects/projects.sqlite ".backup '$d/projects.sqlite'"
last=$(ls -1d /srv/diamond/backups/*/ | grep -v "$d" | tail -n 1 || true)
if [ -n "$last" ] && [ -d "${last}files" ]; then rsync -a --delete --link-dest="${last}files" /srv/diamond/projects/files/ "$d/files/"
else rsync -a /srv/diamond/projects/files/ "$d/files/"; fi
ls -1d /srv/diamond/backups/*/ | head -n -7 | xargs -r rm -rf
EOF
chmod +x /etc/cron.daily/diamond-backup
echo "Server ready. Next: on the Mac, deploy/engine-sync.sh root@<server> and deploy/send-keys.sh root@<server> (the keys), then here:"
echo "  docker compose -f deploy/docker-compose.yml up -d --build"
