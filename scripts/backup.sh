#!/usr/bin/env bash
set -euo pipefail
umask 077
# Uses the selected Compose project. Never writes credentials into the dump name.
: "${COMPOSE_PROJECT_NAME:=kit-demo}"
export COMPOSE_PROJECT_NAME
if [[ -n "${BACKUP_CONTAINER:-}" ]]; then
  db_exec=(docker exec -i "$BACKUP_CONTAINER")
else
  db_exec=(docker compose exec -T db)
fi
backup_db="${BACKUP_DB:-campus}"
backup_user="${BACKUP_USER:-campus}"
backup_dir="${BACKUP_DIR:-backups}"
if [[ ! "$backup_db" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ || ! "$backup_user" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo 'Invalid database/user identifier' >&2; exit 2
fi
mkdir -p "$backup_dir"
backup_file="$backup_dir/${backup_db}-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
backup_partial="$backup_file.partial"
trap 'rm -f "$backup_partial"' EXIT
"${db_exec[@]}" pg_dump -U "$backup_user" -d "$backup_db" --format=custom --no-owner --no-acl > "$backup_partial"
[[ -s "$backup_partial" ]]
mv "$backup_partial" "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
printf '%s\n' "$backup_file"
