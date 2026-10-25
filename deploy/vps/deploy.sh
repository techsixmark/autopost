#!/usr/bin/env bash
# Roll out the current checkout: static files → containers → HTTPS entry in the shared LMS Caddy.
#   cd /opt/autopost/app && git pull && deploy/vps/deploy.sh   (update.sh does this every 2 min)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Run bootstrap.sh first" >&2; exit 1; }
set -a && . ./.env && set +a

WEB_DIR=/opt/autopost/web
SITE_FILE=/opt/caddy-sites/autopost.caddy

echo "==> $(date '+%F %T') deploy $(git rev-parse --short HEAD)"

echo "==> Static files → $WEB_DIR"
# Only the site's own files: never .git, deploy/ (.env) or docs/.
tmp=$(mktemp -d)
find ../.. -maxdepth 1 -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \
  -o -name '*.ico' -o -name '*.png' -o -name '*.svg' \) -exec cp -t "$tmp" {} +
mkdir -p "$WEB_DIR"
cp -a "$tmp"/. "$WEB_DIR"/
for f in "$WEB_DIR"/*; do [ -e "$tmp/$(basename "$f")" ] || rm -f "$f"; done
rm -rf "$tmp"

echo "==> Containers"
docker compose up -d --remove-orphans

# The LMS Caddy asks Let's Encrypt for the Autopost domains as soon as it sees them: only hand
# them over once all four resolve to this VPS (failed validations are rate-limited).
echo "==> HTTPS entry in the LMS Caddy ($SITE_FILE)"
ip=$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
ready=1
for d in "$APP_DOMAIN" "$API_DOMAIN" "$STUDIO_DOMAIN" "$N8N_DOMAIN"; do
  # getent exits 2 for a missing record: must not end the script (set -e + pipefail)
  r=$(getent ahostsv4 "$d" | awk 'NR==1 {print $1}' || true)
  [ "$r" = "$ip" ] || { echo "    $d → ${r:-no DNS record} (expected $ip)"; ready=0; }
done
if [ "$ready" = 0 ]; then
  echo "    Skipped until DNS is ready; re-run deploy.sh afterwards."
  exit 0
fi
new=$(sed -e "s|@APP_DOMAIN@|$APP_DOMAIN|" -e "s|@API_DOMAIN@|$API_DOMAIN|" \
  -e "s|@STUDIO_DOMAIN@|$STUDIO_DOMAIN|" -e "s|@N8N_DOMAIN@|$N8N_DOMAIN|" edge.caddy)
if [ -f "$SITE_FILE" ] && [ "$new" = "$(cat "$SITE_FILE")" ]; then
  echo "    Unchanged."
  exit 0
fi
[ -f "$SITE_FILE" ] && cp "$SITE_FILE" "$SITE_FILE.bak"
printf '%s\n' "$new" >"$SITE_FILE"
if docker exec lms-caddy caddy reload --config /etc/caddy/Caddyfile; then
  echo "    LMS Caddy reloaded."
else
  # Never leave a file that would stop the LMS Caddy from starting next time.
  if [ -f "$SITE_FILE.bak" ]; then mv "$SITE_FILE.bak" "$SITE_FILE"; else rm -f "$SITE_FILE"; fi
  echo "    Reload failed: previous LMS Caddy config kept." >&2
  exit 1
fi
