#!/usr/bin/env bash
# Nightly backup (cron, 02:30): a compressed PostgreSQL dump into ./backups (the last 14 days are
# kept on the server disk). When BACKUP_S3_BUCKET is set in .env (Phase 9), the dump and a copy of
# the uploaded images also go to that private S3 bucket, using the instance's IAM role (no keys on
# the server); the bucket expires them after 30 days. A successful off-server copy touches
# backups/offsite-ok, which the monitor checks.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:/snap/bin" # the AWS CLI is a snap; cron's PATH doesn't include it

stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump="offer_platform-${stamp}.dump"
docker compose exec -T postgres pg_dump -U offer_platform -d offer_platform --format=custom > "backups/${dump}"
find backups -name 'offer_platform-*.dump' -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: ${dump}"

bucket=$(sed -n 's/^BACKUP_S3_BUCKET=//p' .env 2>/dev/null | tr -d '"\r' | tail -1)
if [[ -z "${bucket}" ]]; then
  echo "$(date -u +%FT%TZ) off-server copy skipped: BACKUP_S3_BUCKET is not set in .env"
  exit 0
fi

aws s3 cp --only-show-errors "backups/${dump}" "s3://${bucket}/db/${dump}"
# The images live in the api container's volume; stream them as one tar (no extra local disk).
docker compose exec -T api tar -C /data/storage -cf - . \
  | aws s3 cp --only-show-errors - "s3://${bucket}/storage/storage-${stamp}.tar"
touch backups/offsite-ok
echo "$(date -u +%FT%TZ) off-server copy ok: s3://${bucket}/db/${dump} and storage/storage-${stamp}.tar"
