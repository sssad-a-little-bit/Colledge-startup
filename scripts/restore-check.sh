#!/usr/bin/env bash
set -euo pipefail
# Must run in a dedicated demo/test Compose project with writes paused.
# Creates a new temporary DB. Never restores into or drops the source DB.
: "${COMPOSE_PROJECT_NAME:=kit-demo}"
export COMPOSE_PROJECT_NAME
if [[ -n "${BACKUP_CONTAINER:-}" ]]; then
  db_exec=(docker exec -i "$BACKUP_CONTAINER")
else
  db_exec=(docker compose exec -T db)
fi
restore_file="${1:?Usage: bash scripts/restore-check.sh path/to/backup.dump}"
source_db="${BACKUP_DB:-campus}"
restore_user="${BACKUP_USER:-campus}"
if [[ ! "$source_db" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ || ! "$restore_user" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo 'Invalid database/user identifier' >&2; exit 2
fi
[[ -f "$restore_file" && -s "$restore_file" ]]
if [[ -f "$restore_file.sha256" ]]; then sha256sum -c "$restore_file.sha256"; fi
restore_db="restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
restore_created=0
cleanup() {
  if [[ "$restore_created" = 1 && "$restore_db" == restore_check_* ]]; then
    "${db_exec[@]}" dropdb -U "$restore_user" --if-exists "$restore_db"
  fi
}
trap cleanup EXIT
# This account requires CREATEDB only in the isolated backup verification environment.
"${db_exec[@]}" createdb -U "$restore_user" "$restore_db"
restore_created=1
"${db_exec[@]}" pg_restore -U "$restore_user" -d "$restore_db" --exit-on-error --no-owner --no-acl < "$restore_file"
# Counts plus stable hashes of key records catch an empty or wrong restore.
check_sql=$(cat <<'SQL'
SELECT 'users',count(*)::text FROM "User"
UNION ALL SELECT 'groups',count(*)::text FROM "Group"
UNION ALL SELECT 'memberships',count(*)::text FROM "Membership"
UNION ALL SELECT 'assignments',count(*)::text FROM "Assignment"
UNION ALL SELECT 'lessons',count(*)::text FROM "Lesson"
UNION ALL SELECT 'assessments',count(*)::text FROM "Assessment"
UNION ALL SELECT 'grades',count(*)::text FROM "Grade"
UNION ALL SELECT 'grade_history',count(*)::text FROM "GradeHistory"
UNION ALL SELECT 'notifications',count(*)::text FROM "Notification"
UNION ALL SELECT 'news',count(*)::text FROM "News"
UNION ALL SELECT 'audit',count(*)::text FROM "Audit"
UNION ALL SELECT 'lesson_digest',md5(coalesce(string_agg(id || ':' || "startsAt"::text || ':' || "roomId" || ':' || version::text, '|' ORDER BY id),'')) FROM "Lesson"
UNION ALL SELECT 'grade_digest',md5(coalesce(string_agg(id || ':' || "studentId" || ':' || coalesce(value::text,'null') || ':' || kind::text || ':' || version::text, '|' ORDER BY id),'')) FROM "Grade"
ORDER BY 1;
SQL
)
source_result=$("${db_exec[@]}" psql -X -U "$restore_user" -d "$source_db" -At -v ON_ERROR_STOP=1 -c "$check_sql")
restored_result=$("${db_exec[@]}" psql -X -U "$restore_user" -d "$restore_db" -At -v ON_ERROR_STOP=1 -c "$check_sql")
if [[ "$source_result" != "$restored_result" ]]; then
  echo 'Restore differs from source. Pause writes and use a fresh backup; inspect privately.' >&2
  exit 1
fi
printf 'RESTORE_OK database=%s\n' "$restore_db"
printf '%s\n' "$restored_result"
echo 'Temporary restore database will be removed; source remains unchanged.'
