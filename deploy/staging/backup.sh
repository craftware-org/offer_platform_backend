#!/usr/bin/env bash
# Compressed PostgreSQL dump into ./backups (on the server disk), keeping the last 14 days.
# Before public launch: also copy to S3 (off-server) and use RDS automated backups (Phase 9).
set -euo pipefail
cd "$(dirname "$0")"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T postgres pg_dump -U offer_platform -d offer_platform --format=custom \
  > "backups/offer_platform-${stamp}.dump"
find backups -name 'offer_platform-*.dump' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: offer_platform-${stamp}.dump"
