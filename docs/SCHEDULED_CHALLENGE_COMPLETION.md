# Server-scheduled challenge completion

Migration `20260821000000_server_scheduled_challenge_completion.sql` removes app launch as a prerequisite for terminal challenge outcomes.

## Architecture

Supabase Cron (`pg_cron`) runs `kinwin-challenge-completion` every 15 minutes. The job uses `pg_net` to POST to the dedicated `scheduled-finalize-challenges` Edge Function. Its named secret API key is read from Supabase Vault at execution time; no key is stored in git or in the cron command itself.

The worker:

1. acquires a 20-minute database lease and creates a run-history row;
2. claims at most 50 eligible challenges using server time and persisted `challenge_periods.reporting_closes_at` values;
3. atomically reconciles elapsed `active` or `completion_mode` rows to `awaiting_resolution`;
4. re-runs the versioned deterministic TypeScript evaluator from persisted challenge, period and check-in data;
5. calls `finalize_challenge_result`, which row-locks the challenge and atomically writes its terminal status plus one deduplicated social event;
6. records aggregate counts and individual challenge failure codes, then releases the lease.

One malformed challenge is recorded and skipped; it does not prevent later candidates in the same batch. A crashed worker's lease expires after 20 minutes, so later runs recover automatically.

Fifteen minutes keeps completion timely without imposing minute-level polling load. The batch limit and supporting partial indexes avoid unbounded scans.

## Security and idempotency

`scheduled-finalize-challenges` is not a user endpoint. It uses Supabase's service-to-service contract: `verify_jwt = false`, a named `sb_secret_…` key in the `apikey` header, and `@supabase/server` with `auth: 'secret:default'`. This is not public access and is not a user JWT. Worker RPCs are `SECURITY DEFINER`, have fixed empty `search_path`, and explicitly revoke execution from `PUBLIC`, `anon`, and `authenticated`; only the worker's admin client (`service_role`) may execute them.

Database row locks, terminal-state guards, the unresolved-challenge invariant, the worker lease, and `social_activity(owner_id, dedupe_key)` together make retries and client/worker races harmless. A completed success cannot later become failure, and vice versa.

The authenticated `finalize-challenge` endpoint remains as a faster opportunistic path when the owner opens Kinwin. Both paths share `finalizePersistedChallenge` and the same atomic terminal RPC.

## Outcome is not fulfillment

This worker only determines and persists challenge truth. It does not update consequence status, create charge attempts, call Stripe, create reward fulfillments, or call Tremendous. A later payment worker may independently consume durable `completed_failure` rows with its own idempotency and retry state.

## Observability

- Dispatch history: `cron.job_run_details` for job `kinwin-challenge-completion`.
- Actual worker runs: `private.challenge_completion_worker_runs`.
- Per-challenge failures: `private.challenge_completion_worker_failures`.
- A run records start/finish time, status, eligible/reconciled/success/failure/error counts, and a non-sensitive error code.

## Hosted deployment

The repository migration installs `pg_cron` and `pg_net` when available and creates the job reproducibly with `cron.schedule`. Before the first dispatch, hosted Vault must contain:

- `kinwin_project_url`
- `kinwin_cron_secret_key`

Create or rotate these through supported Supabase tooling without printing or committing the decrypted values. Deploy the Edge Function before enabling the schedule. Verify extension versions, Vault secret names, the active `cron.job` row, `cron.job_run_details`, worker run history, and all function grants after deployment.

Official references: [Supabase Cron](https://supabase.com/docs/guides/cron), [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart), and [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).
