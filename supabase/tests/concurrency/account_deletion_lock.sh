#!/usr/bin/env bash
# Real two-session concurrency proof for the owner-level advisory lock added
# in 20260904000000_account_deletion_service_role_rpc_and_locking.sql.
#
# supabase/tests/run.sh's suite (including 340_account_deletion.sql) runs
# every statement sequentially through a single psql connection — it can
# prove the lock *exists* and is acquired, but it cannot prove it actually
# *blocks* a second, truly concurrent session, which is the entire point of
# an advisory lock. This script opens two real, separate Postgres
# connections and times one against the other, exactly like a genuine race
# between a user tapping "Delete account" and prepare_challenge_from_draft
# running at (almost) the same instant.
#
# Case 1: deletion acquires the lock first (simulating
#   private.delete_account_owned_data already running) -> a concurrent
#   prepare_challenge_from_draft for the same owner must wait for the whole
#   deletion transaction to finish, and once it wakes, must fail (the
#   owner's draft no longer exists) rather than silently creating a
#   commitment for a deleted account.
# Case 2: prepare_challenge_from_draft acquires the lock first (simulating a
#   user completing a new commitment) -> a concurrent delete_account_owned_
#   data call for the same owner must wait, then re-check eligibility against
#   the now-committed new challenge and correctly reject the deletion with
#   'active_challenge' — never delete an account that just gained a live,
#   non-terminal commitment.
#
# Uses its own disposable database (independent of run.sh's), the same
# safety-checked naming convention, and the same 000_auth_stub.sql stand-in
# for auth.uid()/auth.users. Success is the process exit code, same as
# run.sh — every check below is a machine assertion (exact substring match
# on captured psql output, or an elapsed-time threshold), never a
# console-transcript read.
#
# Requires a local Postgres server reachable as the `postgres` role, same as
# run.sh. Usage: supabase/tests/concurrency/account_deletion_lock.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$TESTS_DIR/../migrations"
RUN_AS_POSTGRES=(sudo -u postgres)

DB_NAME="kinwin_test_conc_$$"
if [[ ! "$DB_NAME" =~ ^kinwin_test_conc_[a-zA-Z0-9_]+$ ]]; then
  echo "ERROR: refusing to use unsafe database name '$DB_NAME'." >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"

cleanup() {
  local rc=$?
  echo "==> Cleaning up disposable database '$DB_NAME'"
  "${RUN_AS_POSTGRES[@]}" dropdb --if-exists "$DB_NAME" || true
  rm -rf "$WORKDIR"
  exit "$rc"
}
trap cleanup EXIT

echo "==> Creating disposable database '$DB_NAME'"
"${RUN_AS_POSTGRES[@]}" dropdb --if-exists "$DB_NAME"
"${RUN_AS_POSTGRES[@]}" createdb "$DB_NAME"

PSQL=(psql -v ON_ERROR_STOP=1 -d "$DB_NAME")

echo "==> Applying local auth stub and every real migration, in filename order"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$TESTS_DIR/000_auth_stub.sql"
for migration in "$MIGRATIONS_DIR"/*.sql; do
  "${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" < "$migration"
done

echo "==> Seeding two fresh owners (L1, L2), each with one valid ready_for_activation draft and nothing else"
# An account with no challenges is eligible for deletion regardless of any
# draft it holds — account_deletion_blocker never inspects challenge_drafts
# — so each owner here starts eligible, and deleting them also deletes that
# draft (private.delete_account_owned_data's own `challenge_drafts` delete).
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" <<'SQL'
insert into auth.users (id, email) values
  ('35000000-0000-0000-0000-000000000001', 'lock-l1@example.test'),
  ('35000000-0000-0000-0000-000000000002', 'lock-l2@example.test');
insert into public.profiles (id, display_name, kin_code) values
  ('35000000-0000-0000-0000-000000000001', 'Lock L1', 'LOCKL1AA'),
  ('35000000-0000-0000-0000-000000000002', 'Lock L2', 'LOCKL2AA')
on conflict (id) do nothing;

insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35100000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 1,
  jsonb_build_object('schemaVersion',1,'id','35100000-0000-0000-0000-000000000001','ownerId','35000000-0000-0000-0000-000000000001',
    'goal','Sleep better','behavior',jsonb_build_object('description','Strength train','completionDefinition','Complete the planned session','rule',jsonb_build_object('direction','build','measurement',jsonb_build_object('type','completion','unit','completion'),'rhythm',jsonb_build_object('type','daily','periodUnit','day','target',1))),
    'duration',jsonb_build_object('unit','week','value',4),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1,'totalPlannedCompletions',28,'minimumRequiredCompletions',20,'continuitySafeguard',jsonb_build_object('type','maximum_consecutive_missed_days','maximum',2),'periodTarget',1,'periodUnit','day'),
    'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','recipient','recipientId','r1'),
    'experienceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'invitationMessage','Join me in this promise.','membershipSelection','monthly_trial'),
  'ready_for_activation'
);
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35200000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 1,
  jsonb_build_object('schemaVersion',1,'id','35200000-0000-0000-0000-000000000001','ownerId','35000000-0000-0000-0000-000000000002',
    'goal','Sleep better','behavior',jsonb_build_object('description','Strength train','completionDefinition','Complete the planned session','rule',jsonb_build_object('direction','build','measurement',jsonb_build_object('type','completion','unit','completion'),'rhythm',jsonb_build_object('type','daily','periodUnit','day','target',1))),
    'duration',jsonb_build_object('unit','week','value',4),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1,'totalPlannedCompletions',28,'minimumRequiredCompletions',20,'continuitySafeguard',jsonb_build_object('type','maximum_consecutive_missed_days','maximum',2),'periodTarget',1,'periodUnit','day'),
    'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','recipient','recipientId','r1'),
    'experienceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'invitationMessage','Join me in this promise.','membershipSelection','monthly_trial'),
  'ready_for_activation'
);
SQL

now_ms() { date +%s%3N; }

echo "==> Case 1: deletion holds the owner lock first"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" <<'SQL' &
set role service_role;
begin;
select private.delete_account_owned_data('35000000-0000-0000-0000-000000000001');
select pg_sleep(3);
commit;
SQL
CASE1_A_PID=$!

sleep 1

CASE1_B_START=$(now_ms)
set +e
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" > "$WORKDIR/case1_b.log" 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000001', false);
select public.prepare_challenge_from_draft('35100000-0000-0000-0000-000000000001');
SQL
CASE1_B_STATUS=$?
set -e
CASE1_B_END=$(now_ms)
wait "$CASE1_A_PID"

CASE1_B_ELAPSED=$((CASE1_B_END - CASE1_B_START))
echo "    prepare_challenge_from_draft blocked for ${CASE1_B_ELAPSED}ms, exit status ${CASE1_B_STATUS}"

if [[ "$CASE1_B_ELAPSED" -lt 1500 ]]; then
  echo "FAIL (Case 1): prepare_challenge_from_draft did not block on the owner lock — elapsed ${CASE1_B_ELAPSED}ms, expected >= 1500ms while deletion held it." >&2
  cat "$WORKDIR/case1_b.log" >&2
  exit 1
fi
if [[ "$CASE1_B_STATUS" -eq 0 ]]; then
  echo "FAIL (Case 1): prepare_challenge_from_draft succeeded for an owner whose account had already been deleted." >&2
  cat "$WORKDIR/case1_b.log" >&2
  exit 1
fi
if ! grep -q "draft not found" "$WORKDIR/case1_b.log"; then
  echo "FAIL (Case 1): expected 'draft not found' once L1's draft was gone; got:" >&2
  cat "$WORKDIR/case1_b.log" >&2
  exit 1
fi
echo "==> Case 1 OK: deletion held the lock for the whole transaction; the concurrent commitment attempt blocked, then correctly failed once the owner no longer existed."

echo "==> Case 2: a new commitment holds the owner lock first"
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" <<'SQL' &
set role authenticated;
select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000002', false);
begin;
select public.prepare_challenge_from_draft('35200000-0000-0000-0000-000000000001');
select pg_sleep(3);
commit;
SQL
CASE2_B_PID=$!

sleep 1

CASE2_A_START=$(now_ms)
set +e
"${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" > "$WORKDIR/case2_a.log" 2>&1 <<'SQL'
set role service_role;
select private.delete_account_owned_data('35000000-0000-0000-0000-000000000002');
SQL
CASE2_A_STATUS=$?
set -e
CASE2_A_END=$(now_ms)
wait "$CASE2_B_PID"

CASE2_A_ELAPSED=$((CASE2_A_END - CASE2_A_START))
echo "    delete_account_owned_data blocked for ${CASE2_A_ELAPSED}ms, exit status ${CASE2_A_STATUS}"

if [[ "$CASE2_A_ELAPSED" -lt 1500 ]]; then
  echo "FAIL (Case 2): delete_account_owned_data did not block on the owner lock — elapsed ${CASE2_A_ELAPSED}ms, expected >= 1500ms while the new commitment held it." >&2
  cat "$WORKDIR/case2_a.log" >&2
  exit 1
fi
if [[ "$CASE2_A_STATUS" -eq 0 ]]; then
  echo "FAIL (Case 2): delete_account_owned_data succeeded even though a brand-new non-terminal challenge had just been committed for the same owner." >&2
  cat "$WORKDIR/case2_a.log" >&2
  exit 1
fi
if ! grep -q "active_challenge" "$WORKDIR/case2_a.log"; then
  echo "FAIL (Case 2): expected the deletion to be rejected with 'active_challenge' once it saw the new commitment; got:" >&2
  cat "$WORKDIR/case2_a.log" >&2
  exit 1
fi

echo "==> Verifying L2's new commitment survived the rejected deletion attempt untouched"
REMAINING="$("${RUN_AS_POSTGRES[@]}" "${PSQL[@]}" -t -A <<'SQL'
select count(*) from public.challenges where owner_id = '35000000-0000-0000-0000-000000000002' and challenge_status = 'pending_activation';
SQL
)"
if [[ "$(echo "$REMAINING" | tr -d '[:space:]')" != "1" ]]; then
  echo "FAIL (Case 2): expected L2's new pending commitment to still exist after the rejected deletion attempt, got count '$REMAINING'." >&2
  exit 1
fi

echo "==> Case 2 OK: the new commitment held the lock for the whole transaction; deletion blocked, then correctly rejected the now-non-terminal owner, leaving the commitment intact."

echo "==> All concurrency assertions passed (process exit code is the source of truth, not this line)."
