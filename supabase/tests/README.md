# Executable migration tests

These SQL files exercise every migration under `supabase/migrations/` — the initial
schema, `20260804000000_profile_on_signup.sql`, `20260805000000_prepare_challenge_from_draft.sql`,
and `20260806000000_cancel_pending_challenge.sql` — against a real, disposable local
PostgreSQL 16 database. `run.sh` applies them in filename order, the same order Supabase
itself applies migrations in. Every expectation in every file
is a machine assertion (`001_test_helpers.sql`) — **success is defined by the process
exit code of `supabase/tests/run.sh`, not by reading the console transcript.** Exit code
`0` means every assertion in every file passed; any nonzero exit means at least one did
not, and the transcript shows exactly which one and why.

## How the assertions work

`001_test_helpers.sql` defines three helpers, installed only in the disposable test
database:

- `test.assert_true(name, condition, detail)` — fails unless `condition` is true.
- `test.assert_equals(name, actual, expected)` — fails unless `actual` equals `expected`
  (a row count, a persisted column value, a boolean, …).
- `test.assert_fails(name, sql_text, expected_sqlstate)` — runs `sql_text` as dynamic SQL
  and fails unless it raises an error; if `expected_sqlstate` is given, also fails if the
  statement failed with a *different* SQLSTATE, so an unrelated error can never
  masquerade as the expected denial (e.g. `42501` insufficient_privilege for a grant
  denial, `23514` check_violation, `23505` unique_violation, `23503`
  foreign_key_violation, or `23000` for the two custom immutability/append-only triggers,
  which both raise that exact code).

Every helper `RAISE EXCEPTION`s on failure. Every test file is run with
`psql -v ON_ERROR_STOP=1`, so a single failed assertion aborts that file immediately;
`run.sh` runs the files in sequence and aborts on the first failure (fail-fast), which
`bash -e` then turns into a nonzero exit for the whole script. There is no step where a
person has to interpret NOTICE/ERROR lines to know whether the suite passed — the exit
code already tells you, and the harness itself has been proven to enforce that (see
"Harness self-test" below).

## Disposable database safety

`run.sh` only ever operates on a name matching `^kinwin_test_[a-zA-Z0-9_]+$`:

- The default is `kinwin_test_$$` (`$$` = the run's own process ID), generated fresh
  every invocation.
- `KINWIN_TEST_DB` may override the name, but only within that same prefix — an unset
  variable uses the safe default, and any set value (including an empty string, or a
  name like `postgres`, `template0`, `template1`, or anything containing characters
  outside `[a-zA-Z0-9_]`) that doesn't match the pattern is **rejected before any
  destructive command runs**.
- `CREATE`/`DROP DATABASE` are issued via `createdb`/`dropdb`, which take the name as a
  plain process argument — never string-interpolated into SQL — so even a name that
  somehow passed the regex could not inject SQL through this path.
- An `EXIT` trap always runs `dropdb --if-exists` on the way out, whether the run
  succeeded or failed, and re-exits with the *original* failing code afterward — cleanup
  never turns a failed run into an apparently successful one, and a cleanup hiccup never
  masks the real failure either.

## What this does and does not prove

**Does prove**, because it runs the real migration SQL against a real PostgreSQL server:
schema/index/trigger creation, `CHECK` constraints, foreign keys, Row Level Security
policies, and table/column grants all behave exactly as written — these are native
PostgreSQL features and behave identically whether the server is self-hosted or run by
Supabase.

**Does not prove**: anything specific to Supabase's own platform layer — GoTrue issuing
and verifying JWTs, PostgREST's request handling and its own interpretation of grants,
Storage/Realtime, or the `supabase` CLI's local Docker-based stack. This is PostgreSQL-level
validation, not full Supabase-platform validation. This environment had a working Docker
daemon but the full Supabase local stack was not exercised; a natively installed
PostgreSQL 16 server was used instead, which is sufficient to validate everything the
migration itself defines.

`000_auth_stub.sql` creates a minimal, clearly-labeled stand-in for the parts of the
`auth` schema Supabase already provides: an `auth.users` table (referenced by foreign
keys and by the new `on_auth_user_created` trigger) and an `auth.uid()` function. The
stub's `auth.uid()` is not a simplification — it is the same implementation Supabase
itself uses: read the `request.jwt.claim.sub` session setting (which PostgREST populates
from the caller's verified JWT on every request). Tests simulate a caller by running
`select set_config('request.jwt.claim.sub', '<uuid>', false);` before their queries,
exactly as a real authenticated request would arrive with that setting already populated.
Real signup goes through GoTrue (running as the platform-internal `supabase_auth_admin`
role), which this harness cannot run; tests simulate "a signup happened" by inserting
into `auth.users` as `service_role` instead — the stub grants that role (and only that
role) access to the `auth` schema for this purpose, since it is the harness's existing
stand-in for trusted, non-client-reachable operations.

The GoTrue/PostgREST gap noted above is closed in CI, not in this local dev sandbox
(which cannot reach Docker image registries or GitHub release binaries — see git history
for the earlier bounded attempts). `.github/workflows/supabase-e2e.yml`'s `supabase-e2e`
job runs on a GitHub-hosted runner, which has a working Docker daemon: it installs the
Supabase CLI, runs `supabase start` (the real local Postgres + GoTrue + PostgREST stack,
migrations applied automatically on first boot), and runs
`supabase/tests/e2e/auth-and-draft.e2e.ts` against it — real signup, login, profile
auto-creation, draft insert/update/reload, and cross-user isolation over real HTTP
through a real `@supabase/supabase-js` client and real GoTrue-issued JWTs. See that
file's own header comment and `../../.github/workflows/supabase-e2e.yml` for what it
covers. Before any production deployment, also re-run equivalent checks against a
disposable hosted Supabase project — CI proves the local stack, not the hosted one.

## Running

```bash
supabase/tests/run.sh
```

Requires a local PostgreSQL server reachable as the `postgres` role (this repository's
dev container has one pre-installed; start it with `pg_ctlcluster 16 main start` if it
isn't already running). The script creates a fresh `kinwin_test_*` database, applies the
stub, the assertion helpers, and the real migration, seeds fixture data, runs every test
file, and drops the database again — always, via the exit trap above. It never touches a
hosted or production Supabase project.

## Files, in run order

| File | Exercises |
| --- | --- |
| `000_auth_stub.sql` | Local-only stand-in for `auth.users` / `auth.uid()`. Not part of the migration. |
| `001_test_helpers.sql` | The `test.assert_*` helpers described above. Not part of the migration. |
| `010_seed.sql` | Two owners, one fully activated challenge, one row in every table, six extra `challenge_drafts` fixtures for `090_prepare_challenge_from_draft.sql` (complete/ready, complete/ready reserved, incomplete/ready, complete/not-ready, complete/ready reserved for the atomicity test, complete-except-for-a-bare-rule-object/ready), and — for `100_cancel_pending_challenge.sql` — two pre-built pending commitments (challenge + recipient + consequence + archived source draft, as `prepare_challenge_from_draft` would have left them) plus one already-`active` challenge, inserted as a trusted party. |
| `020_rls_anon.sql` | Anonymous access to every public table and one write attempt — every case asserted to fail with `42501`. |
| `030_rls_authenticated_owner.sql` | Owner reads/writes their own profile and draft (row count + persisted value asserted); every write to activated/runtime tables asserted to fail with `42501`. |
| `040_rls_authenticated_non_owner.sql` | A second authenticated user: row counts asserted zero on another owner's data; an update against another owner's draft asserted to affect zero rows and leave the value unchanged; manages their own profile normally. |
| `050_private_schema_isolation.sql` | `private` schema asserted unreachable (`42501`) to both `authenticated` and `anon`. |
| `060_immutability_and_append_only.sql` | The activation-snapshot trigger (asserted `23000`), cross-challenge correction rejection (asserted `23503`), preserved Cut back history (row counts + values asserted), and append-only `check_in_events` (asserted `23000`, including for `service_role`) — all as the trusted role. |
| `070_constraints.sql` | Representative valid (row count asserted) and invalid (`23514`/`23505` asserted) rows for status/enum, recipient, period, check-in, stake/currency, charge-attempt, and fulfillment constraints. |
| `080_profile_trigger.sql` | The `on_auth_user_created` trigger: a new `auth.users` row produces exactly one `public.profiles` row with a matching id; repeating the trigger's own idempotent insert pattern against an id that already has a profile does not duplicate it; the trigger function itself is asserted uncallable (`42501`) by `authenticated` or `anon`. |
| `090_prepare_challenge_from_draft.sql` | The `prepare_challenge_from_draft` RPC: successful atomic creation of the challenge/recipient/consequence rows and draft archival; a repeated request returns the same challenge with no duplicate; another user cannot prepare someone else's draft (`P0002`, indistinguishable from not-found); an incomplete/tampered draft that still satisfies `challenge_drafts`' own looser CHECK constraints is rejected (`22023`), including a draft whose `behavior.rule`/`successRule` are bare, incomplete objects that pass those constraints but aren't a real, evaluable rule pair; a not-yet-ready draft is rejected; an unauthenticated call is rejected (`28000`); `anon` has no execute grant at all (`42501`); a deliberately-failed wrapping transaction proves every row count is unchanged afterward (true atomicity); direct client writes to the rows this RPC just created remain impossible (`42501`). |
| `100_cancel_pending_challenge.sql` | Reading a pending commitment (owner sees it; a non-owner's read is silently filtered to zero rows; `anon` is denied outright, `42501`) and the `cancel_pending_challenge` RPC: successful atomic cancellation of both the challenge and its consequence; nothing deleted (recipient row and archived source draft both survive); a repeated cancel is idempotent; another user cannot cancel it (`P0002`); canceling an already-`active` challenge is rejected (`22023`) and leaves it unchanged; an unknown id is rejected the same as one owned by someone else; an unauthenticated call is rejected (`28000`); `anon` has no execute grant (`42501`); a new draft can be inserted right after cancellation; direct client writes to the canceled rows remain impossible (`42501`). |

## Harness self-test

Before relying on this suite, the harness itself was proven trustworthy — not just the
migration — by deliberately breaking things and confirming the runner notices:

1. **Normal run**: `supabase/tests/run.sh` — exit `0`, all 89 assertions pass (83 from the
   original schema/RLS/constraints suite, 6 from `080_profile_trigger.sql`).
2. **Deliberately broken control**: the `check_in_events` append-only triggers were
   commented out in a local, uncommitted copy of the migration. Re-running the suite
   exited `3`, and the transcript pinpointed exactly which assertion caught it
   (`checkin_update_denied_even_for_service_role` — "statement unexpectedly succeeded").
   The real migration was restored via `git checkout` immediately afterward; nothing
   broken was ever committed.
3. **Restore and rerun**: with the real migration back, the suite exited `0` again.
4. **Unsafe name rejection**: `KINWIN_TEST_DB=postgres`, `template0`, `template1`,
   `kinwin_test` (missing the required trailing separator), an empty string, and a string
   containing a `; DROP DATABASE …` payload were all rejected with a clear error and
   exit `1` — before any `createdb`/`dropdb` call.
5. **Intentional assertion failure**: a temporary, never-committed test file asserting
   `1 = 2` was added, exercised (exit `3`, the exact deliberate failure reported), and
   removed. The `dropdb` cleanup line still ran, and no test database was left behind.
6. **Repeatability**: two further clean runs from scratch both exited `0` with all 89
   assertions passing.

A glob regression specific to this package's addition is worth naming: the test-file
loop originally matched `0[2-7]*.sql`, silently excluding `080_profile_trigger.sql` (its
prefix starts with `8`, outside `[2-7]`) — the suite still exited `0`, but with only the
original 83 assertions, having silently run zero of the six new ones. This was caught by
checking the assertion *count*, not just the exit code, after adding the new file, and
fixed by widening the pattern to `0[2-9][0-9]_*.sql`. Anyone adding a new `NNN_*.sql` file
in the `08`–`99` range should confirm the new assertions actually appear in the count.
