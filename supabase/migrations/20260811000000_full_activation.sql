-- Trusted full activation (docs/BACKEND_IMPLEMENTATION_PLAN.md phase 3b).
-- Moves an already-prepared `pending_activation` challenge (see
-- 20260805000000_prepare_challenge_from_draft.sql) to `active`, writing the
-- immutable `activation_snapshot` and activation timestamps/timezone, and
-- calling `private.generate_challenge_periods` in the same transaction.
--
-- Founder-locked product decisions this implements:
--   - Activation does NOT wait for recipient sharing/confirmation — the
--     owner may activate as soon as setup requirements (including a real,
--     webhook-verified payment authorization) are satisfied.
--   - The reporting window (the gap between a period's tracking end and its
--     check-in/correction deadline) is a fixed 24 hours for V1, persisted
--     concretely on every generated period rather than inferred by the
--     check-in engine at read time (see the `generate_challenge_periods`
--     replacement below).
--
-- Activation must never bypass payment authorization: `activate_challenge_draft`
-- requires `consequences.authorization_status = 'authorized'` — the same
-- webhook-verified field docs/PRODUCT_DECISIONS.md's "Consequence payment
-- setup" section already established as the only trustworthy signal. There
-- is no path in this function that reaches `challenge_status = 'active'`
-- without that check passing first.

-- `docs/CHECK_IN_ENGINE.md`'s "Reporting window" section deliberately left
-- this duration unset in SQL. `reporting_closes_at` is added here, backfilled
-- defensively (no row is expected to exist yet — `generate_challenge_periods`
-- has never been called against real data before this migration — but the
-- backfill is harmless and correct either way), then locked to NOT NULL.
alter table public.challenge_periods add column reporting_closes_at timestamptz;
update public.challenge_periods set reporting_closes_at = ends_at + interval '24 hours'
  where reporting_closes_at is null;
alter table public.challenge_periods alter column reporting_closes_at set not null;
alter table public.challenge_periods add constraint challenge_periods_reporting_after_ends
  check (reporting_closes_at > ends_at);

-- Full replacement of 20260809000000_server_generated_periods.sql's function
-- (PL/pgSQL functions can only be updated by redefining the whole body, not
-- patched incrementally). The only change from the original is adding
-- `reporting_closes_at` to both `challenge_periods` inserts, per the locked
-- 24-hour V1 reporting window above — every other line, including all
-- validation, idempotency, and DST/local-midnight boundary logic, is
-- unchanged. See that migration's own header comment for the full design
-- rationale, which still applies unmodified.
create or replace function private.generate_challenge_periods(
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

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'unknown IANA timezone: %', p_timezone using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'pending challenge not found' using errcode = 'P0002';
  end if;
  if v_challenge.challenge_status <> 'pending_activation' then
    raise exception 'challenge must be pending_activation to generate periods, was: %', v_challenge.challenge_status
      using errcode = '22023';
  end if;

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
      v_period_kind := 'continuous';
      v_target_payload := jsonb_build_object('type', 'maximum_lapses', 'maximum', v_boundary_max_lapses);
  end case;

  v_local_end := v_local_start + (v_duration_value * 7 || ' days')::interval;
  v_planned_ends_at := v_local_end at time zone p_timezone;

  case v_period_kind
    when 'day' then v_period_count := v_duration_value * 7;
    when 'week' then v_period_count := v_duration_value;
    when 'continuous' then v_period_count := 1;
  end case;

  if v_period_kind = 'continuous' then
    insert into public.challenge_periods (
      challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload
    )
    values (
      p_challenge_id, 1, 'continuous', v_starts_at, v_planned_ends_at,
      v_planned_ends_at + interval '24 hours', v_target_payload
    );
  else
    for v_i in 0 .. v_period_count - 1 loop
      if v_period_kind = 'day' then
        v_period_start := (v_local_start + (v_i || ' days')::interval) at time zone p_timezone;
        v_period_end := (v_local_start + ((v_i + 1) || ' days')::interval) at time zone p_timezone;
      else
        v_period_start := (v_local_start + (v_i * 7 || ' days')::interval) at time zone p_timezone;
        v_period_end := (v_local_start + ((v_i + 1) * 7 || ' days')::interval) at time zone p_timezone;
      end if;
      insert into public.challenge_periods (
        challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload
      )
      values (
        p_challenge_id, v_i + 1, v_period_kind, v_period_start, v_period_end,
        v_period_end + interval '24 hours', v_target_payload
      );
    end loop;
  end if;

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

revoke all on function private.generate_challenge_periods(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function private.generate_challenge_periods(uuid, timestamptz, text) to service_role;

-- Full activation itself. Owner-callable directly (like
-- prepare_challenge_from_draft/cancel_pending_challenge), not via an Edge
-- Function — there is no external provider call here, only trusted reads
-- and one atomic write, so the extra hop buys nothing.
create function public.activate_challenge_draft(challenge_id uuid, activation_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  -- Copied from the parameter for the same shadowing reason
  -- cancel_pending_challenge.sql documents: challenge_periods/consequences
  -- below have their own challenge_id columns.
  target_id uuid := challenge_id;
  v_challenge public.challenges%rowtype;
  v_consequence public.consequences%rowtype;
  v_draft public.challenge_drafts%rowtype;
  v_recipients jsonb;
  v_organizer_type text;
  v_organizer_recipient_id text;
  v_membership_selection text;
  v_snapshot jsonb;
  v_period_result jsonb;
  v_starts_at timestamptz;
  v_planned_ends_at timestamptz;
  v_activation_instant timestamptz := now();
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(length(btrim(activation_timezone)), 0) = 0 then
    raise exception 'a timezone is required to activate' using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = target_id and owner_id = caller for update;
  if not found then
    -- Identical to a not-found error for a challenge owned by someone else,
    -- so this never discloses whether a given id exists.
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  -- Idempotent: an already-active challenge (this call, or an earlier
  -- attempt that already committed) returns the same result instead of
  -- erroring or re-activating.
  if v_challenge.challenge_status = 'active' then
    return jsonb_build_object(
      'challengeId', v_challenge.id, 'status', 'active',
      'startsAt', v_challenge.starts_at, 'plannedEndsAt', v_challenge.planned_ends_at
    );
  end if;
  if v_challenge.challenge_status <> 'pending_activation' then
    raise exception 'challenge must be pending_activation to activate, was: %', v_challenge.challenge_status
      using errcode = '22023';
  end if;

  -- The payment gate. This is the only check standing between a pending
  -- commitment and an active one that matters financially: activation must
  -- never proceed on the client's say-so, only on the same
  -- webhook-verified `authorization_status` docs/PRODUCT_DECISIONS.md's
  -- "Consequence payment setup" section already established as the sole
  -- trustworthy signal (set only by supabase/functions/stripe-consequence-webhook
  -- after a verified `setup_intent.succeeded` event).
  select * into v_consequence from public.consequences where public.consequences.challenge_id = target_id;
  if not found or v_consequence.authorization_status <> 'authorized' then
    raise exception 'a verified payment authorization is required before activation' using errcode = '22023';
  end if;

  if v_challenge.source_draft_id is null then
    raise exception 'malformed commitment: no source draft' using errcode = '22023';
  end if;
  select * into v_draft from public.challenge_drafts where id = v_challenge.source_draft_id;
  if not found or v_draft.draft_status <> 'archived' then
    raise exception 'malformed commitment: source draft is missing or not archived' using errcode = '22023';
  end if;

  v_recipients := coalesce(v_draft.draft_payload -> 'recipients', '[]'::jsonb);
  v_organizer_type := v_draft.draft_payload #>> '{rewardOrganizer,type}';
  v_organizer_recipient_id := case when v_organizer_type = 'recipient'
    then v_draft.draft_payload #>> '{rewardOrganizer,recipientId}' else null end;

  -- No real membership entitlement sync exists yet (phase 7, unbuilt) — the
  -- only membership fact genuinely known at this point is what the owner
  -- selected at draft time, which prepare_challenge_from_draft already
  -- required to be 'monthly_trial'. Mapped honestly to the trial state
  -- rather than invented; this mapping should be revisited once phase 7
  -- lands and a real membership row exists to read instead.
  v_membership_selection := v_draft.draft_payload ->> 'membershipSelection';
  if v_membership_selection is distinct from 'monthly_trial' then
    raise exception 'malformed commitment: membership selection is invalid' using errcode = '22023';
  end if;

  v_snapshot := jsonb_build_object(
    'id', v_challenge.id::text,
    'ownerId', caller::text,
    'schemaVersion', v_challenge.schema_version,
    'ruleEngineVersion', v_challenge.rule_engine_version,
    'goal', v_draft.draft_payload ->> 'goal',
    'behavior', v_draft.draft_payload -> 'behavior',
    'duration', v_draft.draft_payload -> 'duration',
    'successRule', v_draft.draft_payload -> 'successRule',
    'recipients', v_recipients,
    'rewardOrganizer', v_draft.draft_payload -> 'rewardOrganizer',
    'consequenceCategory', v_draft.draft_payload ->> 'experienceCategory',
    'stake', v_draft.draft_payload -> 'stake',
    'sitOutAcknowledged', v_draft.draft_payload -> 'sitOutAcknowledged',
    'membershipStatusAtActivation', 'trialing'
  );

  -- The trusted period generator validates the timezone and the draft's
  -- rule/duration shape itself and raises on any problem — if it fails,
  -- nothing below has run yet and this whole call rolls back atomically.
  v_period_result := private.generate_challenge_periods(target_id, v_activation_instant, activation_timezone);
  v_starts_at := (v_period_result ->> 'startsAt')::timestamptz;
  v_planned_ends_at := (v_period_result ->> 'plannedEndsAt')::timestamptz;

  update public.challenges set
    challenge_status = 'active',
    timezone = activation_timezone,
    activated_at = v_activation_instant,
    starts_at = v_starts_at,
    planned_ends_at = v_planned_ends_at,
    activation_snapshot = v_snapshot
  where id = target_id;

  return jsonb_build_object(
    'challengeId', target_id, 'status', 'active',
    'startsAt', v_starts_at, 'plannedEndsAt', v_planned_ends_at
  );
end;
$$;

revoke all on function public.activate_challenge_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_challenge_draft(uuid, text) to authenticated;
