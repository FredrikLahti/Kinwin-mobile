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
MIGRATIONS_DIR="$SCRIPT_DIR/../migrations"
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

# Piped via stdin rather than psql's own -f: -f would have the `postgres`
# OS user open the file directly, which fails with "Permission denied" in
# CI (e.g. GitHub Actions), where the checkout isn't readable by other OS
# users. Redirection is opened by the invoking user — who does have read
# access — before sudo hands the already-open file descriptor to postgres,
# so this works regardless of the checkout directory's permissions.
echo "==> Applying local auth stub (not part of the production migration)"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$SCRIPT_DIR/000_auth_stub.sql"

echo "==> Installing test-only assertion helpers (not part of the production migration)"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$SCRIPT_DIR/001_test_helpers.sql"

echo "==> Applying every real migration unmodified, in filename order"
for migration in "$MIGRATIONS_DIR"/*.sql; do
  echo "---- $(basename "$migration") ----"
  "${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$migration"
done

echo "==> Seeding fixture data"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$SCRIPT_DIR/010_seed.sql"

echo "==> Running RLS, immutability, and constraint assertions (fail-fast)"
# 020-099 and 100-999: numbered test files run in filename order after the
# 000/001/010 setup files above. `nullglob` makes an empty range expand to
# nothing instead of a literal, unmatched pattern, so adding a new range
# here can never silently break the loop even if it's ever briefly empty —
# see supabase/tests/README.md's "Harness self-test" for the earlier,
# shipped version of exactly this bug (020-099 alone was too narrow to
# catch 080_profile_trigger.sql at first) and 100_cancel_pending_challenge.sql
# was caught the same way before it ever merged.
shopt -s nullglob
for f in "$SCRIPT_DIR"/0[2-9][0-9]_*.sql "$SCRIPT_DIR"/[1-9][0-9][0-9]_*.sql; do
  echo "---- $(basename "$f") ----"
  "${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$f"
done
shopt -u nullglob

echo "==> All assertions passed (process exit code is the source of truth, not this line)."
