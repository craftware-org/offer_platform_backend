#!/usr/bin/env bash
# Deploys the current git commit to the staging server (run from the repo root on a dev machine).
#   bash deploy/staging/deploy.sh <server-ip> <path-to-key.pem>
# Ships the committed source (git archive: no .env, no local files), builds the image ON the
# server, runs migrations, restarts api/worker, then checks health.
set -euo pipefail

HOST="${1:?usage: deploy.sh <server-ip> <key.pem>}"
KEY="${2:?usage: deploy.sh <server-ip> <key.pem>}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$HOST"
REV=$(git rev-parse --short HEAD)

if ! git diff --quiet HEAD; then
  echo "Uncommitted changes present: only the committed state ($REV) will be deployed."
fi

echo "==> Uploading source $REV"
git archive --format=tar HEAD | $SSH "mkdir -p /opt/offer-platform/src.new && tar -x -C /opt/offer-platform/src.new"
$SSH "set -e
  cd /opt/offer-platform
  # Keep server-only files (.env, backups) across deploys.
  if [ -d src/deploy/staging ]; then
    cp -a src/deploy/staging/.env src.new/deploy/staging/.env 2>/dev/null || true
    cp -a src/deploy/staging/backups src.new/deploy/staging/ 2>/dev/null || true
  fi
  rm -rf src.old && { [ -d src ] && mv src src.old || true; } && mv src.new src
  echo $REV > src/REVISION"

echo "==> Building and starting (migrations run first)"
$SSH "cd /opt/offer-platform/src/deploy/staging && IMAGE_TAG=$REV docker compose build migrate \
  && docker tag offer-platform-api:$REV offer-platform-api:latest \
  && docker compose up -d --remove-orphans"

echo "==> Health"
DOMAIN=$($SSH "grep '^API_DOMAIN=' /opt/offer-platform/src/deploy/staging/.env | cut -d= -f2")
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/v1/health/ready" >/dev/null 2>&1; then
    echo "Deployed $REV — https://$DOMAIN/api/v1/health/ready is ready"
    exit 0
  fi
  sleep 5
done
echo "Health check did not pass yet; inspect with: $SSH 'cd /opt/offer-platform/src/deploy/staging && docker compose ps && docker compose logs --tail 50 api'"
exit 1
