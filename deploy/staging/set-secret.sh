#!/usr/bin/env bash
# Sets one secret in .env WITHOUT it appearing on screen, in shell history, or in any chat.
#   ./set-secret.sh SMTP_PASSWORD
# For SMTP_PASSWORD it also switches EMAIL_PROVIDER to smtp and restarts the API.
set -euo pipefail
cd "$(dirname "$0")"

KEY="${1:?usage: set-secret.sh <KEY>}"
case "$KEY" in
  SMTP_PASSWORD) ;;
  *) echo "Unsupported key: $KEY"; exit 1 ;;
esac

read -r -s -p "Enter value for $KEY (input hidden): " VALUE
echo
[ -n "$VALUE" ] || { echo "Empty value, nothing changed."; exit 1; }
# Gmail shows App Passwords in groups of four; spaces are not part of the password.
VALUE="${VALUE// /}"

tmp=$(mktemp)
awk -v key="$KEY" -v val="$VALUE" 'BEGIN{FS=OFS="="} $1==key{$0=key"="val} {print}' .env > "$tmp"
if [ "$KEY" = "SMTP_PASSWORD" ]; then
  sed -i 's/^EMAIL_PROVIDER=.*/EMAIL_PROVIDER=smtp/' "$tmp"
fi
cat "$tmp" > .env && rm -f "$tmp"
chmod 600 .env

docker compose up -d --force-recreate api worker
echo "$KEY saved. API restarted."
