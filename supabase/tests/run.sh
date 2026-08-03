#!/usr/bin/env bash
# Applies the initial Supabase migration to a fresh, disposable local Postgres
# database and runs the SQL test files in this directory against it.
#
# Requires a local Postgres server the invoking user can reach as the
# `postgres` role (e.g. `pg_ctlcluster 16 main start` on Debian/Ubuntu, or
# `pg_ctl start` after `initdb`). This script only ever touches a database
# named by DB_NAME below — never a hosted or production Supabase project.
#
# Usage: supabase/tests/run.sh
set -euo pipefail

DB_NAME="${KINWIN_TEST_DB:-kinwin_test}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$SCRIPT_DIR/../migrations/20260803000000_initial_kinwin_schema.sql"
PSQL=(psql -v ON_ERROR_STOP=1 -d "$DB_NAME")
RUN_AS_POSTGRES=(sudo -u postgres)

echo "==> Resetting disposable database '$DB_NAME'"
"${RUN_AS_POSTGRES[@]}" psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
"${RUN_AS_POSTGRES[@]}" psql -c "CREATE DATABASE $DB_NAME;"

echo "==> Applying local auth stub (not part of the production migration)"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$SCRIPT_DIR/000_auth_stub.sql"

echo "==> Applying the real migration unmodified"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$MIGRATION"

echo "==> Seeding fixture data"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$SCRIPT_DIR/010_seed.sql"

echo "==> Running RLS, immutability, and constraint tests"
for f in "$SCRIPT_DIR"/0[2-7]*.sql; do
  echo "---- $(basename "$f") ----"
  # ON_ERROR_STOP is intentionally off here: several statements in each file
  # are expected to fail (that failure IS the assertion). Read the transcript.
  "${RUN_AS_POSTGRES[@]}" psql -v ON_ERROR_STOP=0 -d "$DB_NAME" -f "$f"
done

echo "==> Cleaning up disposable database '$DB_NAME'"
"${RUN_AS_POSTGRES[@]}" psql -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "==> Done. Read the transcript above: every 'invalid_*'/'*_denied' case must show an ERROR, every 'valid_*'/'owner_*' case must show a result row."
