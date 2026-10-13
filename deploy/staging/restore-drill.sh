#!/usr/bin/env bash
# Backup restore drill (Phase 8): restores the newest dump into a temporary database next to the
# live one, checks it, compares row counts with live, then drops it. The live database is only read.
#   bash restore-drill.sh            newest dump in ./backups (on the server disk)
#   bash restore-drill.sh --from-s3  newest dump in the off-server bucket (BACKUP_S3_BUCKET, Phase 9);
#                                    also checks that the newest images copy can be read
# Run it on the server from this folder, from a file, not piped through ssh: "docker compose exec"
# would swallow the rest of the script.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PATH:/snap/bin" # the AWS CLI is a snap

if [[ "${1:-}" == "--from-s3" ]]; then
  bucket=$(sed -n 's/^BACKUP_S3_BUCKET=//p' .env 2>/dev/null | tr -d '"\r' | tail -1)
  [[ -n "${bucket}" ]] || { echo "BACKUP_S3_BUCKET is not set in .env" >&2; exit 1; }
  # Names carry a UTC timestamp, so the last one in sort order is the newest.
  newest=$(aws s3 ls "s3://${bucket}/db/" | awk '{print $4}' | grep '^offer_platform-.*\.dump$' | sort | tail -1 || true)
  [[ -n "${newest}" ]] || { echo "No dumps in s3://${bucket}/db/" >&2; exit 1; }
  dump="backups/s3-drill.dump"
  aws s3 cp --only-show-errors "s3://${bucket}/db/${newest}" "${dump}"
  echo "Downloaded s3://${bucket}/db/${newest}"
  images=$(aws s3 ls "s3://${bucket}/storage/" | awk '{print $4}' | grep '^storage-.*\.tar$' | sort | tail -1 || true)
  if [[ -n "${images}" ]]; then
    copied=$(aws s3 cp --only-show-errors "s3://${bucket}/storage/${images}" - | tar -tf - | grep -vc '/$' || true)
    live=$(docker compose exec -T api find /data/storage -type f < /dev/null | wc -l)
    echo "Images copy ${images}: ${copied} files readable (live now: ${live})"
  else
    echo "No images copy in s3://${bucket}/storage/ yet"
  fi
else
  dump=$(ls -1t backups/offer_platform-*.dump 2>/dev/null | head -1 || true)
  if [[ -z "${dump}" ]]; then
    echo "No backups found in ./backups. Run: bash backup.sh" >&2
    exit 1
  fi
fi
echo "Backup: ${dump} ($(du -h "${dump}" | cut -f1), $(date -u -r "${dump}" +%FT%TZ))"

psql_in() { docker compose exec -T postgres psql -U offer_platform -d "$1" -v ON_ERROR_STOP=1 -At -c "$2"; }
cleanup() {
  docker compose exec -T postgres dropdb -U offer_platform --if-exists restore_drill >/dev/null 2>&1 || true
  rm -f backups/s3-drill.dump
}
trap cleanup EXIT

docker compose exec -T postgres dropdb -U offer_platform --if-exists restore_drill >/dev/null 2>&1 || true
docker compose exec -T postgres createdb -U offer_platform restore_drill
started=$(date +%s)
docker compose exec -T postgres pg_restore -U offer_platform -d restore_drill --no-owner --exit-on-error < "${dump}"
echo "Restored in $(( $(date +%s) - started ))s"

echo "PostGIS in the restored copy: $(psql_in restore_drill 'SELECT postgis_version()')"
echo "Migrations applied (restored / live): $(psql_in restore_drill 'SELECT count(*) FROM drizzle.__drizzle_migrations') / $(psql_in offer_platform 'SELECT count(*) FROM drizzle.__drizzle_migrations')"
printf '%-22s %10s %10s\n' table restored live
for table in users businesses business_locations offers offer_images audit_logs notifications analytics_events; do
  restored=$(psql_in restore_drill "SELECT count(*) FROM ${table}" 2>/dev/null || echo "-")
  live=$(psql_in offer_platform "SELECT count(*) FROM ${table}" 2>/dev/null || echo "-")
  printf '%-22s %10s %10s\n' "${table}" "${restored}" "${live}"
done
echo "Drill passed. Differences are changes made after the backup was taken. The temporary database is removed now."
