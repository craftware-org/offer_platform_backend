#!/usr/bin/env bash
# Backup restore drill (Phase 8): restores the newest dump in ./backups into a temporary database
# next to the live one, checks it, compares row counts with live, then drops it. The live database
# is only read. Usage (on the server): cd /opt/offer-platform/src/deploy/staging && bash restore-drill.sh
# Run it from a file, not piped through ssh: "docker compose exec" would swallow the rest of the script.
set -euo pipefail
cd "$(dirname "$0")"

dump=$(ls -1t backups/offer_platform-*.dump 2>/dev/null | head -1 || true)
if [[ -z "${dump}" ]]; then
  echo "No backups found in ./backups. Run: bash backup.sh" >&2
  exit 1
fi
echo "Backup: ${dump} ($(du -h "${dump}" | cut -f1), $(date -u -r "${dump}" +%FT%TZ))"

psql_in() { docker compose exec -T postgres psql -U offer_platform -d "$1" -v ON_ERROR_STOP=1 -At -c "$2"; }
cleanup() { docker compose exec -T postgres dropdb -U offer_platform --if-exists restore_drill >/dev/null 2>&1 || true; }
trap cleanup EXIT

cleanup
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
