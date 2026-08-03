#!/usr/bin/env bash
# Applies the initial Supabase migration to a fresh, disposable local Postgres
# database, installs test-only assertion helpers, seeds fixtures, and runs
# every SQL test file. Every expectation in those files is a machine
# assertion (see 001_test_helpers.sql) — a single failed assertion aborts
# the file immediately (ON_ERROR_STOP=1) and this script exits nonzero.
# Nothing here is inferred from console output.
#
# Requires a local Postgres server reachable as the `postgres` role (e.g.
# `pg_ctlcluster 16 main start` on Debian/Ubuntu, or `pg_ctl start` after
# `initdb`).
#
# Usage: supabase/tests/run.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$SCRIPT_DIR/../migrations/20260803000000_initial_kinwin_schema.sql"
RUN_AS_POSTGRES=(sudo -u postgres)

# Only a name beginning with `kinwin_test_` and containing nothing but
# [a-zA-Z0-9_] is ever accepted, checked *before* any destructive command
# runs. This makes `postgres`, `template0`, `template1`, an empty value, or
# any production-like name impossible, whether the default is used or
# KINWIN_TEST_DB is overridden. The name is also only ever passed to
# createdb/dropdb as a plain argument — never interpolated into a SQL string
# — so there is no path from an accepted-but-unexpected value to a raw SQL
# injection either; the regex is defense in depth, not the only guard.
DEFAULT_DB_NAME="kinwin_test_$$"
# `+set` (not `:-`) so that KINWIN_TEST_DB explicitly set to an empty string
# is treated as an unsafe override to reject, not silently swapped for the
# default the way `:-` would; only a *truly unset* variable falls back.
if [[ -n "${KINWIN_TEST_DB+set}" ]]; then
  DB_NAME="$KINWIN_TEST_DB"
else
  DB_NAME="$DEFAULT_DB_NAME"
fi

if [[ ! "$DB_NAME" =~ ^kinwin_test_[a-zA-Z0-9_]+$ ]]; then
  echo "ERROR: refusing to use unsafe database name '$DB_NAME'." >&2
  echo "       KINWIN_TEST_DB (if set) must match ^kinwin_test_[a-zA-Z0-9_]+\$." >&2
  exit 1
fi

# Preserves the original failing exit code even though cleanup itself runs
# more commands afterward (which would otherwise overwrite $? by the time
# the trap reaches its own `exit`).
cleanup() {
  local rc=$?
  echo "==> Cleaning up disposable database '$DB_NAME'"
  "${RUN_AS_POSTGRES[@]}" dropdb --if-exists "$DB_NAME" || true
  exit "$rc"
}
trap cleanup EXIT

echo "==> Creating disposable database '$DB_NAME'"
"${RUN_AS_POSTGRES[@]}" dropdb --if-exists "$DB_NAME"
"${RUN_AS_POSTGRES[@]}" createdb "$DB_NAME"

PSQL=(psql -v ON_ERROR_STOP=1 -d "$DB_NAME")

echo "==> Applying local auth stub (not part of the production migration)"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$SCRIPT_DIR/000_auth_stub.sql"

echo "==> Installing test-only assertion helpers (not part of the production migration)"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$SCRIPT_DIR/001_test_helpers.sql"

echo "==> Applying the real migration unmodified"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$MIGRATION"

echo "==> Seeding fixture data"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$SCRIPT_DIR/010_seed.sql"

echo "==> Running RLS, immutability, and constraint assertions (fail-fast)"
for f in "$SCRIPT_DIR"/0[2-7]*.sql; do
  echo "---- $(basename "$f") ----"
  "${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -f "$f"
done

echo "==> All assertions passed (process exit code is the source of truth, not this line)."
