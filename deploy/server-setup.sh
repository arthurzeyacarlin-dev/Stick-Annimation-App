#!/bin/bash
# Run ONCE on a fresh DigitalOcean Ubuntu 24.04 server (4 vCPU / 8 GB), as root:  bash deploy/server-setup.sh
# Installs Docker, opens only the web ports + ssh, makes the folders, and backs up the accounts every night (7 kept).
set -euo pipefail
apt-get update
apt-get install -y ca-certificates curl git ufw sqlite3 rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /srv/diamond/data /srv/diamond/engine /srv/diamond/caddy /srv/diamond/backups
chown -R 1000:1000 /srv/diamond/data /srv/diamond/engine
touch /srv/diamond/settings.env /srv/diamond/build.env && chmod 600 /srv/diamond/settings.env /srv/diamond/build.env
# Nightly account backup: a safe copy of every sqlite file (works while the app runs), 7 nights kept.
cat > /etc/cron.daily/diamond-backup <<'EOF'
#!/bin/bash
set -e
d=/srv/diamond/backups/$(date +%F); mkdir -p "$d"
for f in /srv/diamond/data/spec0015-phase3/*.sqlite; do sqlite3 "$f" ".backup '$d/$(basename "$f")'"; done
ls -1d /srv/diamond/backups/*/ | head -n -7 | xargs -r rm -rf
EOF
chmod +x /etc/cron.daily/diamond-backup
echo "Server ready. Next: dad fills /srv/diamond/settings.env, then: docker compose --env-file /srv/diamond/build.env -f deploy/docker-compose.yml up -d --build"
