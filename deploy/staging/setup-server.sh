#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 24.04+ EC2 instance (run as the `ubuntu` user).
#   bash setup-server.sh <api-domain>        e.g.  bash setup-server.sh 13-233-10-20.sslip.io
# Idempotent: safe to run again. Secrets are generated here and never leave the server.
set -euo pipefail

API_DOMAIN="${1:?usage: setup-server.sh <api-domain>}"
APP_DIR=/opt/offer-platform
STAGING="$APP_DIR/src/deploy/staging"
# The .env template is copied next to this script (the source arrives later, with the first deploy).
TEMPLATE="$(dirname "$(readlink -f "$0")")/.env.example"
[ -f "$TEMPLATE" ] || { echo "Missing $TEMPLATE: copy deploy/staging/.env.example next to this script"; exit 1; }

echo "==> System updates and automatic security patches"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades ufw ca-certificates curl openssl
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> 2 GB swap (small instances such as t3.micro run out of memory building the image)"
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || { sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile; }
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

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

if [ ! -s "$STAGING/.env" ]; then
  echo "==> Generating .env with fresh secrets"
  secret() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  PG=$(secret)
  # Write to a private temp file first so a failure never leaves a partial .env behind.
  TMP=$(mktemp "$STAGING/.env.XXXXXX")
  sed -e "s|^API_DOMAIN=.*|API_DOMAIN=${API_DOMAIN}|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG}|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://offer_platform:${PG}@postgres:5432/offer_platform|" \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(secret)|" \
      -e "s|^OTP_HASH_SECRET=.*|OTP_HASH_SECRET=$(secret)|" \
      "$TEMPLATE" > "$TMP"
  chmod 600 "$TMP"
  mv "$TMP" "$STAGING/.env"
else
  echo "==> .env already exists (kept)"
fi

echo "==> Nightly database backup at 02:30 (keeps 14 days)"
# `crontab -l` fails when no crontab exists yet; that must not abort the script.
( { crontab -l 2>/dev/null || true; } | grep -v 'offer-platform backup' || true
  echo "30 2 * * * bash $STAGING/backup.sh >> $STAGING/backups/backup.log 2>&1 # offer-platform backup" ) | crontab -

echo "==> Done. Log out and back in once (docker group), then deploy."
