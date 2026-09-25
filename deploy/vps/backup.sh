#!/bin/sh
set -eu

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
backup_dir=/opt/o7/backups/o7-crm
retention_days=${BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$backup_dir/o7-crm-$timestamp.dump"
temporary="$target.incomplete"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
cd "$deploy_dir"

docker compose exec -T postgres sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --format=custom --compress=9 --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  >"$temporary"

docker compose exec -T postgres pg_restore --list <"$temporary" >/dev/null
mv "$temporary" "$target"
sha256sum "$target" >"$target.sha256"
chmod 600 "$target" "$target.sha256"

find "$backup_dir" -type f \( -name 'o7-crm-*.dump' -o -name 'o7-crm-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

printf 'Backup verified: %s\n' "$target"
