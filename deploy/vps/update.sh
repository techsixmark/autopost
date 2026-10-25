#!/usr/bin/env bash
# Every 2 minutes (cron /etc/cron.d/autopost-update): if main moved, fast-forward and deploy.
# Same "push to main = live" behaviour as Vercel, without CI. Log: /var/log/autopost-deploy.log
set -euo pipefail
cd "$(dirname "$0")/../.."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git merge -q --ff-only origin/main
exec deploy/vps/deploy.sh
