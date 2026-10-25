#!/usr/bin/env bash
# One-time setup of Autopost on the shared VPS (deploy/vps/README.md). Re-running skips what exists.
#   1. Self-hosted Supabase in /opt/autopost/supabase (official setup.sh, same ref as the LMS)
#   2. deploy/vps/.env: domains + generated n8n secrets
#   3. n8n database inside autopost-db, cron jobs, then deploy.sh
# First run needs the Google OAuth client of the old Supabase project:
#   GOOGLE_CLIENT_ID=… GOOGLE_SECRET=… ./bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")"

SUPABASE_REF=${SUPABASE_REF:-self-hosted/v0.8.3} # same as /opt/lms/supabase: images are shared
BASE_DIR=/opt/autopost
SUPABASE_DIR="$BASE_DIR/supabase"
SUPABASE_SERVICES="db auth rest meta studio api-gw" # no storage/realtime/functions: unused
APP_DOMAIN=${APP_DOMAIN:-autopost.sixmark.net}
API_DOMAIN=${API_DOMAIN:-api-autopost.sixmark.net}
STUDIO_DOMAIN=${STUDIO_DOMAIN:-studio-autopost.sixmark.net}
N8N_DOMAIN=${N8N_DOMAIN:-n8n.sixmark.net}

# KEY=value in an env file: replace if present, append otherwise (values: no | or &).
env_set() { if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >>"$1"; fi; }
env_get() { sed -n "s/^$2=//p" "$1" | head -n1; }

echo "==> Supabase ($SUPABASE_REF) in $SUPABASE_DIR"
if [ ! -f "$SUPABASE_DIR/.env" ]; then
  : "${GOOGLE_CLIENT_ID:?first run needs GOOGLE_CLIENT_ID}" "${GOOGLE_SECRET:?first run needs GOOGLE_SECRET}"
  tmp=$(mktemp -d)
  git clone -q --depth 1 --filter=blob:none --sparse --branch "$SUPABASE_REF" \
    https://github.com/supabase/supabase "$tmp/sb"
  (cd "$tmp/sb" && git sparse-checkout set docker)
  mkdir -p "$BASE_DIR"
  (cd "$BASE_DIR" && sh "$tmp/sb/docker/setup.sh" -p supabase --skip-deps -y --ref "$SUPABASE_REF")
  rm -rf "$tmp"

  sb="$SUPABASE_DIR/.env"
  env_set "$sb" COMPOSE_PROJECT_NAME autopost-supabase
  env_set "$sb" COMPOSE_FILE docker-compose.yml:docker-compose.autopost.yml
  env_set "$sb" SUPABASE_PUBLIC_URL "https://$API_DOMAIN"
  env_set "$sb" API_EXTERNAL_URL "https://$API_DOMAIN/auth/v1"
  env_set "$sb" SITE_URL "https://$APP_DOMAIN"
  env_set "$sb" ADDITIONAL_REDIRECT_URLS "https://$APP_DOMAIN/**"
  # Google sign-in only. New Google accounts can sign up; allowed_emails + RLS decide access.
  env_set "$sb" DISABLE_SIGNUP false
  env_set "$sb" ENABLE_EMAIL_SIGNUP false
  env_set "$sb" ENABLE_PHONE_SIGNUP false
  env_set "$sb" ENABLE_ANONYMOUS_USERS false
  env_set "$sb" GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
  env_set "$sb" GOOGLE_SECRET "$GOOGLE_SECRET"
fi
cp supabase/docker-compose.autopost.yml "$SUPABASE_DIR/"
(cd "$SUPABASE_DIR" && docker compose up -d $SUPABASE_SERVICES)
for _ in $(seq 1 60); do docker exec autopost-db pg_isready -q -U postgres && break; sleep 2; done

echo "==> deploy/vps/.env"
[ -f .env ] || install -m 600 /dev/null .env
env_set .env APP_DOMAIN "$APP_DOMAIN"
env_set .env API_DOMAIN "$API_DOMAIN"
env_set .env STUDIO_DOMAIN "$STUDIO_DOMAIN"
env_set .env N8N_DOMAIN "$N8N_DOMAIN"
[ -n "$(env_get .env N8N_ENCRYPTION_KEY)" ] || env_set .env N8N_ENCRYPTION_KEY "$(openssl rand -hex 32)"
[ -n "$(env_get .env N8N_DB_PASSWORD)" ] || env_set .env N8N_DB_PASSWORD "$(openssl rand -hex 24)"

echo "==> n8n database"
docker exec -i autopost-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -v pw="$(env_get .env N8N_DB_PASSWORD)" <<'SQL'
select format('create role n8n login password %L', :'pw')
  where not exists (select from pg_roles where rolname = 'n8n') \gexec
select 'create database n8n owner n8n'
  where not exists (select from pg_database where datname = 'n8n') \gexec
SQL

echo "==> Cron: backup 02:45 daily, pull + deploy every 2 minutes"
app_dir=$(cd ../.. && pwd)
cat >/etc/cron.d/autopost-backup <<EOF
45 2 * * * root $app_dir/deploy/vps/backup.sh >>/var/log/autopost-backup.log 2>&1
EOF
cat >/etc/cron.d/autopost-update <<EOF
*/2 * * * * root $app_dir/deploy/vps/update.sh >>/var/log/autopost-deploy.log 2>&1
EOF

./deploy.sh
