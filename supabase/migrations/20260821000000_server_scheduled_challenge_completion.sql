-- Server-scheduled challenge completion.
--
-- Supabase Cron invokes a dedicated service-only Edge Function every 15
-- minutes. The database remains responsible for eligibility, the
-- active/completion_mode -> awaiting_resolution transition, leases,
-- observability, and the already-existing atomic terminal write. The Edge
-- Function remains responsible for the versioned TypeScript evaluator.
-- Consequence charging and reward fulfillment are deliberately absent.

-- These modules are available on hosted Supabase. The conditional install
-- keeps the repository's plain-Postgres assertion harness usable on hosts
-- that do not package Supabase's extensions; hosted deployment verifies
-- both extensions and the scheduled job after applying this migration.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  else
    raise notice 'pg_cron is unavailable; skipping local cron installation';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  else
    raise notice 'pg_net is unavailable; skipping local HTTP module installation';
  end if;
end;
$$;

create index challenges_completion_worker_candidates_idx
  on public.challenges (challenge_status, planned_ends_at, id)
  where challenge_status in ('active', 'completion_mode', 'awaiting_resolution');

create index challenge_periods_final_reporting_deadline_idx
  on public.challenge_periods (challenge_id, reporting_closes_at desc);

create table private.challenge_completion_worker_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial_failure', 'failed')),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  reconciled_count integer not null default 0 check (reconciled_count >= 0),
  finalized_success_count integer not null default 0 check (finalized_success_count >= 0),
  finalized_failure_count integer not null default 0 check (finalized_failure_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_code text,
  check ((status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null))
);

create index challenge_completion_worker_runs_started_idx
  on private.challenge_completion_worker_runs (started_at desc);

create table private.challenge_completion_worker_failures (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.challenge_completion_worker_runs(id) on delete restrict,
  challenge_id uuid references public.challenges(id) on delete restrict,
  error_code text not null check (length(btrim(error_code)) between 1 and 120),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (run_id, challenge_id)
);

create index challenge_completion_worker_failures_challenge_idx
  on private.challenge_completion_worker_failures (challenge_id);

create table private.challenge_completion_worker_lease (
  singleton boolean primary key default true check (singleton),
  run_id uuid references private.challenge_completion_worker_runs(id) on delete restrict,
  lease_token uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check ((run_id is null and lease_token is null and locked_until is null)
      or (run_id is not null and lease_token is not null and locked_until is not null))
);

alter table private.challenge_completion_worker_runs enable row level security;
alter table private.challenge_completion_worker_failures enable row level security;
alter table private.challenge_completion_worker_lease enable row level security;

insert into private.challenge_completion_worker_lease (singleton) values (true);

revoke all on private.challenge_completion_worker_runs from public, anon, authenticated;
revoke all on private.challenge_completion_worker_failures from public, anon, authenticated;
revoke all on private.challenge_completion_worker_lease from public, anon, authenticated;
grant select, insert, update on private.challenge_completion_worker_runs to service_role;
grant select, insert on private.challenge_completion_worker_failures to service_role;
grant select, update on private.challenge_completion_worker_lease to service_role;

-- Completion Mode is an access restriction, not a reason to leave a
-- finished challenge unresolved. Reconciliation remains purely based on
-- the persisted reporting deadline and never depends on membership state.
create or replace function public.reconcile_challenge_lifecycle(p_challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.challenges c
  set challenge_status = 'awaiting_resolution'
  where c.id = p_challenge_id
    and c.challenge_status in ('active', 'completion_mode')
    and exists (select 1 from public.challenge_periods p where p.challenge_id = c.id)
    and not exists (
      select 1 from public.challenge_periods p
      where p.challenge_id = c.id and p.reporting_closes_at > clock_timestamp()
    );

  select challenge_status into v_status from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

revoke all on function public.reconcile_challenge_lifecycle(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_challenge_lifecycle(uuid) to service_role;

-- A short database lease prevents overlapping cron invocations. A crashed
-- worker cannot block future completion forever: the next run takes over
-- after 20 minutes and records the abandoned run as failed.
create function public.start_challenge_completion_worker()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease private.challenge_completion_worker_lease%rowtype;
  v_run_id uuid;
  v_token uuid;
begin
  select * into v_lease
  from private.challenge_completion_worker_lease
  where singleton = true
  for update;

  if v_lease.locked_until is not null and v_lease.locked_until > clock_timestamp() then
    return jsonb_build_object('status', 'already_running', 'runId', v_lease.run_id);
  end if;

  if v_lease.run_id is not null then
    update private.challenge_completion_worker_runs
    set status = 'failed', finished_at = clock_timestamp(), error_code = 'lease_expired'
    where id = v_lease.run_id and status = 'running';
  end if;

  insert into private.challenge_completion_worker_runs default values returning id into v_run_id;
  v_token := gen_random_uuid();

  update private.challenge_completion_worker_lease
  set run_id = v_run_id,
      lease_token = v_token,
      locked_until = clock_timestamp() + interval '20 minutes',
      updated_at = clock_timestamp()
  where singleton = true;

  return jsonb_build_object('status', 'started', 'runId', v_run_id, 'leaseToken', v_token);
end;
$$;

-- Eligibility and reconciliation happen in one transaction. SKIP LOCKED
-- prevents waiting behind a concurrent client/worker transition. Awaiting
-- rows are returned for finalization; active/completion_mode rows are
-- returned only after their final persisted reporting deadline has closed.
create function public.claim_due_challenge_completions(p_limit integer default 50)
returns table (
  challenge_id uuid,
  owner_id uuid,
  previous_status text,
  current_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'limit must be between 1 and 200' using errcode = '22023';
  end if;

  for v_row in
    select c.id, c.owner_id, c.challenge_status
    from public.challenges c
    left join lateral (
      select p.reporting_closes_at
      from public.challenge_periods p
      where p.challenge_id = c.id
      order by p.reporting_closes_at desc
      limit 1
    ) final_period on true
    where c.challenge_status = 'awaiting_resolution'
       or (
         c.challenge_status in ('active', 'completion_mode')
         and final_period.reporting_closes_at is not null
         and final_period.reporting_closes_at <= clock_timestamp()
       )
    order by final_period.reporting_closes_at nulls first, c.id
    limit p_limit
    for update of c skip locked
  loop
    challenge_id := v_row.id;
    owner_id := v_row.owner_id;
    previous_status := v_row.challenge_status;

    if previous_status in ('active', 'completion_mode') then
      update public.challenges
      set challenge_status = 'awaiting_resolution'
      where id = challenge_id and challenge_status = previous_status;
    end if;

    select c.challenge_status into current_status from public.challenges c where c.id = challenge_id;
    if current_status = 'awaiting_resolution' then
      return next;
    end if;
  end loop;
end;
$$;

create function public.record_challenge_completion_worker_failure(
  p_run_id uuid,
  p_lease_token uuid,
  p_challenge_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.challenge_completion_worker_lease
    where singleton = true and run_id = p_run_id and lease_token = p_lease_token
  ) then
    raise exception 'worker lease is not valid' using errcode = '28000';
  end if;
  if coalesce(length(btrim(p_error_code)), 0) = 0 then
    raise exception 'error code is required' using errcode = '22023';
  end if;

  insert into private.challenge_completion_worker_failures (run_id, challenge_id, error_code)
  values (p_run_id, p_challenge_id, left(p_error_code, 120))
  on conflict (run_id, challenge_id) do update set error_code = excluded.error_code, recorded_at = clock_timestamp();
end;
$$;

create function public.finish_challenge_completion_worker(
  p_run_id uuid,
  p_lease_token uuid,
  p_status text,
  p_eligible_count integer,
  p_reconciled_count integer,
  p_finalized_success_count integer,
  p_finalized_failure_count integer,
  p_failed_count integer,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'partial_failure', 'failed') then
    raise exception 'invalid worker status' using errcode = '22023';
  end if;
  if least(p_eligible_count, p_reconciled_count, p_finalized_success_count, p_finalized_failure_count, p_failed_count) < 0 then
    raise exception 'worker counts cannot be negative' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.challenge_completion_worker_lease
    where singleton = true and run_id = p_run_id and lease_token = p_lease_token
    for update
  ) then
    raise exception 'worker lease is not valid' using errcode = '28000';
  end if;

  update private.challenge_completion_worker_runs
  set finished_at = clock_timestamp(), status = p_status,
      eligible_count = p_eligible_count, reconciled_count = p_reconciled_count,
      finalized_success_count = p_finalized_success_count,
      finalized_failure_count = p_finalized_failure_count,
      failed_count = p_failed_count,
      error_code = case when p_error_code is null then null else left(p_error_code, 120) end
  where id = p_run_id and status = 'running';

  update private.challenge_completion_worker_lease
  set run_id = null, lease_token = null, locked_until = null, updated_at = clock_timestamp()
  where singleton = true;
end;
$$;

revoke all on function public.start_challenge_completion_worker() from public, anon, authenticated;
revoke all on function public.claim_due_challenge_completions(integer) from public, anon, authenticated;
revoke all on function public.record_challenge_completion_worker_failure(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_challenge_completion_worker(uuid, uuid, text, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.start_challenge_completion_worker() to service_role;
grant execute on function public.claim_due_challenge_completions(integer) to service_role;
grant execute on function public.record_challenge_completion_worker_failure(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finish_challenge_completion_worker(uuid, uuid, text, integer, integer, integer, integer, integer, text) to service_role;

-- Repository-managed schedule. The service-role token is placed in Vault
-- during hosted deployment, never in git. pg_net queues the HTTP call;
-- cron.job_run_details plus the private worker tables provide both halves
-- of observability (dispatch and actual processing).
do $$
begin
  if to_regnamespace('cron') is not null and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    perform cron.schedule(
      'kinwin-challenge-completion',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinwin_project_url')
                 || '/functions/v1/scheduled-finalize-challenges',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kinwin_cron_service_role_key'),
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kinwin_cron_service_role_key')
          ),
          body := jsonb_build_object('source', 'supabase_cron'),
          timeout_milliseconds := 120000
        );
      $job$
    );
  else
    raise notice 'Cron/pg_net unavailable; hosted deployment must verify the job after extension installation';
  end if;
end;
$$;
