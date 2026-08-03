# Executable migration tests

These SQL files exercise `supabase/migrations/20260803000000_initial_kinwin_schema.sql`
against a real, disposable local PostgreSQL 16 database. They were written and run as
part of a backend-readiness audit; every result below is from an actual `psql` run, not
inferred from reading the migration.

## What this does and does not prove

**Does prove**, because it runs the real migration SQL against a real PostgreSQL server:
schema/index/trigger creation, `CHECK` constraints, foreign keys, Row Level Security
policies, and table/column grants all behave exactly as written — these are native
PostgreSQL features and behave identically whether the server is self-hosted or run by
Supabase.

**Does not prove**: anything specific to Supabase's own platform layer — GoTrue issuing
and verifying JWTs, PostgREST's request handling and its own interpretation of grants,
Storage/Realtime, or the `supabase` CLI's local Docker-based stack. This environment had
a working Docker daemon but no network path proven fast enough to pull the full Supabase
image set within this session; a natively installed PostgreSQL 16 server was used
instead, which is sufficient to validate everything the migration itself defines.

`000_auth_stub.sql` creates a minimal, clearly-labeled stand-in for the two things the
migration assumes Supabase already provides: an `auth.users` table (referenced by
foreign keys) and an `auth.uid()` function. The stub's `auth.uid()` is not a simplification
— it is the same implementation Supabase itself uses: read the `request.jwt.claim.sub`
session setting (which PostgREST populates from the caller's verified JWT on every
request). Tests simulate a caller by running
`select set_config('request.jwt.claim.sub', '<uuid>', false);` before their queries,
exactly as a real authenticated request would arrive with that setting already populated.

Before any production deployment, re-run equivalent checks against a disposable hosted
Supabase project or the full local Supabase stack (`supabase start`, which needs a
reachable Docker daemon) to additionally cover the GoTrue/PostgREST layer itself.

## Running

```bash
supabase/tests/run.sh
```

Requires a local PostgreSQL server reachable as the `postgres` role (this repository's
dev container has one pre-installed; start it with `pg_ctlcluster 16 main start` if it
isn't already running). The script creates `kinwin_test`, applies the stub and the real
migration, seeds fixture data, runs every test file, and drops the database again. It
never touches a hosted or production Supabase project.

## Files, in run order

| File | Exercises |
| --- | --- |
| `000_auth_stub.sql` | Local-only stand-in for `auth.users` / `auth.uid()`. Not part of the migration. |
| `010_seed.sql` | Two owners, one fully activated challenge, and one row in every table, inserted as a trusted party. |
| `020_rls_anon.sql` | Anonymous access to every public table and one write attempt. |
| `030_rls_authenticated_owner.sql` | Owner reads/writes their own profile and draft; every write to activated/runtime tables is rejected. |
| `040_rls_authenticated_non_owner.sql` | A second authenticated user cannot read or repoint another owner's rows, but manages their own profile normally. |
| `050_private_schema_isolation.sql` | `private` schema is unreachable to both `authenticated` and `anon`. |
| `060_immutability_and_append_only.sql` | The activation-snapshot trigger, cross-challenge correction rejection, preserved Cut back history, and append-only `check_in_events` — all as the trusted `service_role`. |
| `070_constraints.sql` | Representative valid and invalid rows for status/enum, recipient, period, check-in, stake/currency, charge-attempt, and fulfillment constraints. |

## Result summary (last run against this migration)

All of the following were confirmed by actual query output, not by inspection:

- Migration applies cleanly from an empty database; drop/recreate/reapply is reproducible.
- 9 `public` tables have RLS enabled; 3 `private` tables have zero grants to `anon`/`authenticated`
  and no `USAGE` on the `private` schema for either role.
- 14 RLS policies exist, all scoped to `authenticated` and all keyed to `auth.uid()` (directly, or
  via a parent-challenge ownership subquery) — no `anon` policies and no `using (true)` policies.
- Anonymous role: every `SELECT` and the attempted `INSERT` fail with `permission denied` (no grant
  at all, not just an RLS-filtered empty result).
- Authenticated owner: sees exactly their own row in all 9 tables; can update their own draft/profile;
  every write attempt against `challenges`, `check_in_events`, `consequences`, and `memberships` is
  rejected (no grant exists for those at all, for any authenticated user).
- Authenticated non-owner: sees 0 rows of another owner's data everywhere; an `UPDATE` aimed at
  another owner's draft silently affects 0 rows; manages their own profile normally.
- `private` schema: unreachable by `authenticated` or `anon` for read or write.
- The activation-snapshot trigger rejects changes to `activation_snapshot`, `owner_id`, `activated_at`,
  `starts_at`, `planned_ends_at`, `timezone`, `schema_version`, and `rule_engine_version` on an
  activated challenge, even for `service_role`; it still allows `challenge_status` and `completed_at`
  changes.
- A correction event referencing another challenge's event is rejected by the composite foreign key;
  a correction within the same challenge succeeds.
- Two `cut_back_total` events for the same period both remain queryable — the older total is never
  overwritten.
- `check_in_events` rejects `UPDATE` and `DELETE` for every role, including `service_role` — this
  required a migration fix (see the accompanying PR); the original migration only enforced this via
  grants, which stopped clients but not a bug in trusted server code.
- 17 representative valid/invalid records across `challenges`, `memberships`, `challenge_recipients`,
  `challenge_periods`, `check_in_events`, `consequences`, `consequence_charge_attempts`, and
  `reward_fulfillments` all behaved exactly as their constraints specify.
