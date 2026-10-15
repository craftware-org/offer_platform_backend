#!/usr/bin/env bash
# Sets one secret in .env WITHOUT it appearing on screen, in shell history, or in any chat.
#   ./set-secret.sh SMTP_PASSWORD     (also switches EMAIL_PROVIDER to smtp)
#   ./set-secret.sh MSG91_AUTH_KEY    (also switches SMS_PROVIDER to msg91 once MSG91_OTP_TEMPLATE_ID is set)
# Then it restarts the API and worker.
set -euo pipefail
cd "$(dirname "$0")"

KEY="${1:?usage: set-secret.sh <KEY>}"
case "$KEY" in
  SMTP_PASSWORD|MSG91_AUTH_KEY) ;;
  *) echo "Unsupported key: $KEY"; exit 1 ;;
esac

read -r -s -p "Enter value for $KEY (input hidden): " VALUE
echo
[ -n "$VALUE" ] || { echo "Empty value, nothing changed."; exit 1; }
# Gmail shows App Passwords in groups of four; spaces are not part of the password.
VALUE="${VALUE// /}"

tmp=$(mktemp)
awk -v key="$KEY" -v val="$VALUE" 'BEGIN{FS=OFS="="} $1==key{$0=key"="val; found=1} {print} END{if(!found) print key"="val}' .env > "$tmp"
if [ "$KEY" = "SMTP_PASSWORD" ]; then
  sed -i 's/^EMAIL_PROVIDER=.*/EMAIL_PROVIDER=smtp/' "$tmp"
fi
if [ "$KEY" = "MSG91_AUTH_KEY" ]; then
  if grep -q '^MSG91_OTP_TEMPLATE_ID=.' "$tmp"; then
    sed -i 's/^SMS_PROVIDER=.*/SMS_PROVIDER=msg91/' "$tmp"
  else
    echo "Note: MSG91_OTP_TEMPLATE_ID is empty in .env, so phone codes stay in the log until it is set (then run this again)."
  fi
fi
cat "$tmp" > .env && rm -f "$tmp"
chmod 600 .env

docker compose up -d --force-recreate api worker
echo "$KEY saved. API restarted."
