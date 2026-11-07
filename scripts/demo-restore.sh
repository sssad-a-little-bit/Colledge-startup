#!/usr/bin/env bash
set -euo pipefail
# Restores ONLY into a newly created, separately named demo DB. Never replaces a DB.
: "${COMPOSE_PROJECT_NAME:=kit-demo}"
export COMPOSE_PROJECT_NAME
if [[ -n "${BACKUP_CONTAINER:-}" ]]; then
  db_exec=(docker exec -i "$BACKUP_CONTAINER")
else
  db_exec=(docker compose exec -T db)
fi
restore_file="${1:?Usage: bash scripts/demo-restore.sh path/to/demo-backup.dump}"
restore_user="${BACKUP_USER:-campus}"
restore_db="${DEMO_RESTORE_DB:-campus_demo_restore_$(date -u +%Y%m%d%H%M%S)_$$}"
if [[ ! "$restore_db" =~ ^campus_demo_restore_[a-zA-Z0-9_]+$ || ! "$restore_user" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo 'Refusing destination: use a new campus_demo_restore_* database only.' >&2; exit 2
fi
[[ -f "$restore_file" && -s "$restore_file" ]]
if [[ -f "$restore_file.sha256" ]]; then sha256sum -c "$restore_file.sha256"; fi
restore_created=0
restore_success=0
cleanup() {
  if [[ "$restore_created" = 1 && "$restore_success" = 0 ]]; then
    "${db_exec[@]}" dropdb -U "$restore_user" --if-exists "$restore_db"
  fi
}
trap cleanup EXIT
# createdb refuses an existing database; no --if-exists/clean is ever passed to restore.
"${db_exec[@]}" createdb -U "$restore_user" "$restore_db"
restore_created=1
"${db_exec[@]}" pg_restore -U "$restore_user" -d "$restore_db" --exit-on-error --no-owner --no-acl < "$restore_file"
"${db_exec[@]}" psql -X -U "$restore_user" -d "$restore_db" -At -v ON_ERROR_STOP=1 -c 'SELECT '\''users='\'' || count(*) FROM "User"; SELECT '\''lessons='\'' || count(*) FROM "Lesson"; SELECT '\''grades='\'' || count(*) FROM "Grade";'
restore_success=1
printf 'DEMO_RESTORE_OK database=%s\n' "$restore_db"
echo 'Point only the isolated demo application DATABASE_URL at this new database, then restart and test sign-in.'
