#!/usr/bin/env bash
# Every 2 minutes (cron /etc/cron.d/autopost-update): if main moved, fast-forward and deploy.
# Same "push to main = live" behaviour as Vercel, without CI. Log: /var/log/autopost-deploy.log
set -euo pipefail
cd "$(dirname "$0")/../.."
git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  # Nothing new. Until HTTPS is on, keep checking DNS so it turns on by itself once the records exist.
  [ -f /opt/caddy-sites/autopost.caddy ] || exec deploy/vps/deploy.sh --edge-only
  exit 0
fi
git merge -q --ff-only origin/main
exec deploy/vps/deploy.sh
