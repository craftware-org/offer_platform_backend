#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04 EC2 instance (run as the `ubuntu` user).
#   bash setup-server.sh <api-domain>        e.g.  bash setup-server.sh 13-233-10-20.sslip.io
# Idempotent: safe to run again. Secrets are generated here and never leave the server.
set -euo pipefail

API_DOMAIN="${1:?usage: setup-server.sh <api-domain>}"
APP_DIR=/opt/offer-platform
STAGING="$APP_DIR/src/deploy/staging"

echo "==> System updates and automatic security patches"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades ufw ca-certificates curl openssl
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall: only SSH, HTTP and HTTPS"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "==> SSH: keys only (no passwords)"
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/99-offer-platform.conf >/dev/null
sudo systemctl reload ssh

echo "==> Docker (Ubuntu packages)"
if ! command -v docker >/dev/null; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
fi

echo "==> App folders"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
mkdir -p "$STAGING/backups"

if [ ! -f "$STAGING/.env" ]; then
  echo "==> Generating .env with fresh secrets"
  secret() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  PG=$(secret)
  sed -e "s|^API_DOMAIN=.*|API_DOMAIN=${API_DOMAIN}|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG}|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://offer_platform:${PG}@postgres:5432/offer_platform|" \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(secret)|" \
      -e "s|^OTP_HASH_SECRET=.*|OTP_HASH_SECRET=$(secret)|" \
      "$STAGING/.env.example" > "$STAGING/.env"
  chmod 600 "$STAGING/.env"
else
  echo "==> .env already exists (kept)"
fi

echo "==> Nightly database backup at 02:30 (keeps 14 days)"
( crontab -l 2>/dev/null | grep -v 'offer-platform backup'; \
  echo "30 2 * * * bash $STAGING/backup.sh >> $STAGING/backups/backup.log 2>&1 # offer-platform backup" ) | crontab -

echo "==> Done. Log out and back in once (docker group), then deploy."
