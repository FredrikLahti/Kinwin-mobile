-- Trusted, deterministic server-side period generator. Designed to be
-- called from the future full-activation transaction (phase 3b in
-- docs/BACKEND_IMPLEMENTATION_PLAN.md), never directly by any client and
-- never by any other public-schema RPC yet. It only creates
-- `challenge_periods` for an already-`pending_activation` challenge, given
-- the activation instant and IANA timezone that phase 3b will decide; it
-- deliberately does not flip `challenge_status` to `active`, does not
-- populate `activation_snapshot`/`activated_at`, and does not touch
-- `timezone` on `challenges` — all of that remains phase 3b's job.
--
-- Lives in `private` (unreachable to any client role — see
-- 050_private_schema_isolation.sql) rather than `public`, since nothing
-- about its calling convention (a raw activation instant + timezone, not an
-- owner-scoped `auth.uid()` check) is safe to expose as a PostgREST RPC.
--
-- This is the single authoritative implementation of the timezone/DST
-- period-boundary calculation. domain/challenge/periods.ts's
-- `GeneratePeriods` stays an unimplemented type signature so no competing
-- TypeScript algorithm can ever drift from this one.

-- Idempotency ledger: what a given challenge was actually generated with,
-- so a repeated call can be told apart from a conflicting one. Not derived
-- from `challenges` itself because phase 3b has not yet written
-- `activated_at`/`starts_at`/`timezone` there at the point this runs.
create table private.challenge_period_generations (
  challenge_id uuid primary key references public.challenges (id) on delete restrict,
  activation_instant timestamptz not null,
  timezone text not null check (length(btrim(timezone)) > 0),
  starts_at timestamptz not null,
  planned_ends_at timestamptz not null,
  period_kind text not null check (period_kind in ('day', 'week', 'continuous')),
  period_count integer not null check (period_count > 0),
  created_at timestamptz not null default now(),
  check (planned_ends_at > starts_at)
);

create function private.generate_challenge_periods(
  p_challenge_id uuid,
  p_activation_instant timestamptz,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
  v_draft public.challenge_drafts%rowtype;
  v_existing private.challenge_period_generations%rowtype;
  v_rule_direction text;
  v_rhythm_type text;
  v_rhythm_target integer;
  v_measurement_type text;
  v_measurement_unit text;
  v_boundary_period_unit text;
  v_boundary_max_value numeric;
  v_boundary_max_lapses integer;
  v_duration_unit text;
  v_duration_value integer;
  v_period_kind text;
  v_period_count integer;
  v_local_start timestamp;
  v_local_end timestamp;
  v_starts_at timestamptz;
  v_planned_ends_at timestamptz;
  v_target_payload jsonb;
  v_i integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  if p_challenge_id is null or p_activation_instant is null or coalesce(length(btrim(p_timezone)), 0) = 0 then
    raise exception 'challenge id, activation instant, and timezone are all required' using errcode = '22023';
  end if;

  -- The only trust boundary for the timezone itself: it must be a real
  -- IANA zone the server's own tzdata knows about, not merely a non-empty
  -- string. Local-day arithmetic below relies on this to be meaningful.
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown IANA timezone: %', p_timezone using errcode = '22023';
  end if;

  -- Lock the challenge row so a concurrent call for the same challenge
  -- serializes behind this one instead of racing the idempotency check
  -- below, mirroring the `for update` pattern in prepare_challenge_from_draft
  -- and cancel_pending_challenge.
  select * into v_challenge from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'pending challenge not found' using errcode = 'P0002';
  end if;
  -- Rejects canceled, active, completion_mode, and completed commitments in
  -- one check: periods may only ever be generated for a still-pending one.
  if v_challenge.challenge_status <> 'pending_activation' then
    raise exception 'challenge must be pending_activation to generate periods, was: %', v_challenge.challenge_status
      using errcode = '22023';
  end if;

  -- Idempotency / conflicting-repeat check, now that the row lock is held:
  -- an identical repeat (same activation instant and timezone) returns the
  -- same result instead of regenerating; anything else is a conflicting
  -- repeat and is rejected outright rather than silently replacing periods.
  select * into v_existing from private.challenge_period_generations where challenge_id = p_challenge_id;
  if found then
    if v_existing.activation_instant = p_activation_instant and v_existing.timezone = p_timezone then
      return jsonb_build_object(
        'challengeId', p_challenge_id,
        'startsAt', v_existing.starts_at,
        'plannedEndsAt', v_existing.planned_ends_at,
        'periodKind', v_existing.period_kind,
        'periodCount', v_existing.period_count
      );
    else
      raise exception 'periods were already generated for this challenge with different activation parameters'
        using errcode = '23505';
    end if;
  end if;

  -- Load the rule and duration from server-stored data only — the
  -- immutable archived source draft (see
  -- 20260807000000_archived_draft_immutability.sql) — never from a
  -- client-supplied parameter. A missing or not-yet-archived draft means
  -- this is not a genuine prepared commitment.
  if v_challenge.source_draft_id is null then
    raise exception 'malformed commitment: no source draft' using errcode = '22023';
  end if;
  select * into v_draft from public.challenge_drafts where id = v_challenge.source_draft_id;
  if not found or v_draft.draft_status <> 'archived' then
    raise exception 'malformed commitment: source draft is missing or not archived' using errcode = '22023';
  end if;

  v_duration_unit := v_draft.draft_payload #>> '{duration,unit}';
  begin
    v_duration_value := (v_draft.draft_payload #>> '{duration,value}')::integer;
  exception when others then
    raise exception 'malformed commitment: duration is invalid' using errcode = '22023';
  end;
  if v_duration_unit is distinct from 'week' or v_duration_value is null or v_duration_value < 2 or v_duration_value > 12 then
    raise exception 'malformed commitment: duration must be between 2 and 12 whole weeks' using errcode = '22023';
  end if;

  v_rule_direction := v_draft.draft_payload #>> '{behavior,rule,direction}';
  if v_rule_direction not in ('build', 'cut_back', 'stop') then
    raise exception 'malformed commitment: behavior rule direction is invalid' using errcode = '22023';
  end if;

  -- starts_at: the next local midnight strictly after the activation
  -- instant. Truncating to the local calendar date and adding one day is
  -- correct regardless of the activation instant's local time-of-day —
  -- even an instant that lands exactly on local midnight is not itself
  -- "after" that midnight, so the next one is always the following day.
  --
  -- Nonexistent-local-midnight policy: a small number of IANA zones (e.g.
  -- America/Santiago) run their spring-forward transition at exactly local
  -- midnight, so "00:00:00" on the transition day is not a real instant.
  -- PostgreSQL's own `AT TIME ZONE` conversion for such a naive timestamp
  -- deterministically resolves it to the first valid local instant after
  -- the gap (e.g. 01:00:00 that day) — every boundary below is computed
  -- the same way, from the same tzdata-consistent conversion, so this
  -- never creates a gap or overlap between adjacent periods; it only means
  -- that one specific boundary, on one specific day, in a small number of
  -- zones, is not literally "00:00:00" local. See
  -- supabase/tests/130_server_generated_periods.sql's
  -- `nonexistent_local_midnight_*` cases for the exact, proven behavior.
  v_local_start := (((p_activation_instant at time zone p_timezone)::date) + 1)::timestamp;
  v_starts_at := v_local_start at time zone p_timezone;

  case v_rule_direction
    when 'build' then
      v_rhythm_type := v_draft.draft_payload #>> '{behavior,rule,rhythm,type}';
      begin
        v_rhythm_target := (v_draft.draft_payload #>> '{behavior,rule,rhythm,target}')::integer;
      exception when others then
        raise exception 'malformed commitment: build rhythm target is invalid' using errcode = '22023';
      end;
      if v_rhythm_type not in ('daily', 'weekly_count', 'specific_days') or v_rhythm_target is null or v_rhythm_target <= 0 then
        raise exception 'malformed commitment: build rhythm is invalid' using errcode = '22023';
      end if;
      -- Build + daily rhythm: one period per local calendar day.
      -- Build + weekly_count or specific_days: one rolling seven-local-day
      -- period per challenge week.
      if v_rhythm_type = 'daily' then
        v_period_kind := 'day';
      else
        v_period_kind := 'week';
      end if;
      v_target_payload := jsonb_build_object('type', 'completion_target', 'target', v_rhythm_target);

    when 'cut_back' then
      v_boundary_period_unit := v_draft.draft_payload #>> '{behavior,rule,boundary,periodUnit}';
      begin
        v_boundary_max_value := (v_draft.draft_payload #>> '{behavior,rule,boundary,maximumValue}')::numeric;
      exception when others then
        raise exception 'malformed commitment: cut_back boundary maximumValue is invalid' using errcode = '22023';
      end;
      v_measurement_type := v_draft.draft_payload #>> '{behavior,rule,measurement,type}';
      v_measurement_unit := v_draft.draft_payload #>> '{behavior,rule,measurement,unit}';
      if v_boundary_period_unit not in ('day', 'week') or v_boundary_max_value is null or v_boundary_max_value <= 0 then
        raise exception 'malformed commitment: cut_back boundary is invalid' using errcode = '22023';
      end if;
      if v_measurement_type not in ('count', 'time', 'amount') or coalesce(length(btrim(v_measurement_unit)), 0) = 0 then
        raise exception 'malformed commitment: cut_back measurement is invalid' using errcode = '22023';
      end if;
      -- Cut back + day boundary: one period per local calendar day.
      -- Cut back + week boundary: one rolling seven-local-day period per
      -- challenge week.
      v_period_kind := v_boundary_period_unit;
      v_target_payload := jsonb_build_object(
        'type', 'maximum_value',
        'maximum', v_boundary_max_value,
        'measurement', jsonb_build_object('type', v_measurement_type, 'unit', v_measurement_unit)
      );

    when 'stop' then
      v_boundary_period_unit := v_draft.draft_payload #>> '{behavior,rule,boundary,periodUnit}';
      begin
        v_boundary_max_lapses := (v_draft.draft_payload #>> '{behavior,rule,boundary,maximumLapses}')::integer;
      exception when others then
        raise exception 'malformed commitment: stop boundary maximumLapses is invalid' using errcode = '22023';
      end;
      if v_boundary_period_unit is distinct from 'challenge' or v_boundary_max_lapses is null or v_boundary_max_lapses < 0 then
        raise exception 'malformed commitment: stop boundary is invalid' using errcode = '22023';
      end if;
      -- Stop: one continuous period covering the whole challenge.
      v_period_kind := 'continuous';
      v_target_payload := jsonb_build_object('type', 'maximum_lapses', 'maximum', v_boundary_max_lapses);
  end case;

  -- planned_ends_at: `duration.value` whole local weeks after starts_at,
  -- computed the same local-naive-then-convert-once way so it lands on a
  -- true local midnight regardless of any DST transition in between.
  v_local_end := v_local_start + (v_duration_value * 7 || ' days')::interval;
  v_planned_ends_at := v_local_end at time zone p_timezone;

  case v_period_kind
    when 'day' then v_period_count := v_duration_value * 7;
    when 'week' then v_period_count := v_duration_value;
    when 'continuous' then v_period_count := 1;
  end case;

  if v_period_kind = 'continuous' then
    insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
    values (p_challenge_id, 1, 'continuous', v_starts_at, v_planned_ends_at, v_target_payload);
  else
    -- Each boundary is computed from local-naive arithmetic and converted
    -- to a UTC instant individually (never by adding a fixed 24h/168h
    -- interval to the previous timestamptz) — this is what keeps every
    -- period's boundary at true local midnight across a DST transition,
    -- letting an individual day span 23 or 25 UTC hours instead of always
    -- exactly 24. On the rare day a zone's own transition makes local
    -- midnight nonexistent, see the nonexistent-local-midnight policy note
    -- above `v_local_start` — the same per-boundary conversion applies here
    -- too, and stays gap-/overlap-free for the same reason.
    for v_i in 0 .. v_period_count - 1 loop
      if v_period_kind = 'day' then
        v_period_start := (v_local_start + (v_i || ' days')::interval) at time zone p_timezone;
        v_period_end := (v_local_start + ((v_i + 1) || ' days')::interval) at time zone p_timezone;
      else
        v_period_start := (v_local_start + (v_i * 7 || ' days')::interval) at time zone p_timezone;
        v_period_end := (v_local_start + ((v_i + 1) * 7 || ' days')::interval) at time zone p_timezone;
      end if;
      insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
      values (p_challenge_id, v_i + 1, v_period_kind, v_period_start, v_period_end, v_target_payload);
    end loop;
  end if;

  -- Written last: if any period insert above failed (e.g. a pre-existing
  -- conflicting period_number), this never runs and the whole call — every
  -- insert it made — rolls back as one atomic unit, since a top-level
  -- function call outside an explicit transaction block is itself one
  -- statement.
  insert into private.challenge_period_generations (
    challenge_id, activation_instant, timezone, starts_at, planned_ends_at, period_kind, period_count
  ) values (
    p_challenge_id, p_activation_instant, p_timezone, v_starts_at, v_planned_ends_at, v_period_kind, v_period_count
  );

  return jsonb_build_object(
    'challengeId', p_challenge_id,
    'startsAt', v_starts_at,
    'plannedEndsAt', v_planned_ends_at,
    'periodKind', v_period_kind,
    'periodCount', v_period_count
  );
end;
$$;

-- Only the trusted backend may ever call this — never anon, never
-- authenticated, and no grant at all beyond service_role. Schema-level
-- isolation (private.* has no USAGE for anon/authenticated, see the
-- initial migration and 050_private_schema_isolation.sql) already makes
-- this unreachable, but the explicit revoke/grant here is the same
-- defense-in-depth pattern every other trusted function in this codebase
-- follows.
revoke all on function private.generate_challenge_periods(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function private.generate_challenge_periods(uuid, timestamptz, text) to service_role;

grant select, insert on table private.challenge_period_generations to service_role;
