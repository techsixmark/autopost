#!/usr/bin/env bash
# Daily at 02:45 (cron /etc/cron.d/autopost-backup): Autopost data (schemas public + auth) and the
# n8n database into /opt/autopost/backups, plus both .env files (the n8n encryption key is needed
# to read saved n8n credentials). Kept 14 days. Log: /var/log/autopost-backup.log
# Same disk as the VPS: losing the VPS loses the backups too; copy them off-site for real safety.
set -euo pipefail
cd "$(dirname "$0")"
dir=/opt/autopost/backups
ts=$(date +%Y%m%d-%H%M)
install -d -m 700 "$dir"

docker exec autopost-db pg_dump -U supabase_admin -d postgres -Fc -n public -n auth >"$dir/db-$ts.dump"
docker exec autopost-db pg_dump -U supabase_admin -d n8n -Fc >"$dir/n8n-$ts.dump"
install -m 600 .env "$dir/app-env-$ts"
install -m 600 /opt/autopost/supabase/.env "$dir/supabase-env-$ts"

find "$dir" -type f -mtime +14 -delete
echo "$(date '+%F %T') backup $ts ok ($(du -sh "$dir" | cut -f1) total)"
