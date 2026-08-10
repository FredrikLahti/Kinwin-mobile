-- Makes challenge completion deterministic and server-trusted. Before this
-- migration, a challenge could pass the end of its final reporting period
-- and remain `active` indefinitely until something happened to invoke
-- finalize-challenge (only ever triggered opportunistically, from a
-- client that noticed its own locally-recomputed result and happened to
-- be open) -- see this migration's own handoff notes for the full
-- inspection this is based on.
--
-- New state: `awaiting_resolution` -- a challenge whose final
-- accountability window has genuinely ended, but whose outcome has not
-- yet been irreversibly finalized. Distinct from both `active` (still
-- genuinely in progress) and the terminal `completed_success` /
-- `completed_failure` (irreversibly resolved). No normal check-in is
-- accepted once here (already true for the *period* level via
-- planCheckInAppend's own `reportingClosesAt` deadline check -- this adds
-- the *challenge*-level counterpart), it cannot be superseded by pretending
-- it is still active, and it still counts as an outstanding accountability
-- obligation for the one-active-challenge invariant (PR #31) -- a user
-- must not be able to start a new challenge just by letting an old one's
-- clock run out without ever resolving it.
alter table public.challenges drop constraint challenges_challenge_status_check;
alter table public.challenges add constraint challenges_challenge_status_check
  check (challenge_status in (
    'pending_activation', 'active', 'awaiting_resolution', 'completion_mode',
    'completed_success', 'completed_failure', 'canceled_before_activation', 'superseded'
  ));

-- Widens PR #31's challenges_owner_one_active_idx: an unresolved ended
-- challenge is still an outstanding obligation, same as a genuinely active
-- one, for the purposes of "may this owner start another challenge".
drop index challenges_owner_one_active_idx;
create unique index challenges_owner_one_unresolved_idx
  on public.challenges (owner_id)
  where challenge_status in ('active', 'completion_mode', 'awaiting_resolution');

-- The reconciliation step: purely time-based (no evaluation, no
-- consequence/social side effects), idempotent, and safe to call
-- repeatedly or concurrently -- a plain UPDATE...WHERE is atomic, and a
-- second call against an already-reconciled row simply matches no rows.
-- Compares the challenge's own real server-generated
-- `reporting_closes_at` timestamps (already computed once, at activation,
-- from the challenge's frozen IANA timezone -- see
-- private.generate_challenge_periods) against `now()`, never a
-- client-supplied clock. Lives in `public`, not `private`, for the same
-- reason append_check_in_event does: called over PostgREST by the
-- finalize-challenge Edge Function using the service-role key, which only
-- works for functions in an exposed schema.
create or replace function public.reconcile_challenge_lifecycle(p_challenge_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.challenges c set challenge_status = 'awaiting_resolution'
  where c.id = p_challenge_id
    and c.challenge_status = 'active'
    and now() > (select max(p.reporting_closes_at) from public.challenge_periods p where p.challenge_id = c.id);

  select challenge_status into v_status from public.challenges where id = p_challenge_id;
  return v_status;
end;
$$;

revoke all on function public.reconcile_challenge_lifecycle(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_challenge_lifecycle(uuid) to service_role;

-- finalize_challenge_result now requires the challenge to already be
-- `awaiting_resolution` (reconciled) rather than `active` -- the
-- finalize-challenge Edge Function calls reconcile_challenge_lifecycle
-- first and only proceeds to evaluate/call this once that has genuinely
-- moved the row out of `active`. A challenge that is still truly in
-- progress is rejected here, same error shape as before.
create or replace function public.finalize_challenge_result(
  p_owner_id uuid,
  p_challenge_id uuid,
  p_status text,
  p_activity_kind text,
  p_activity_payload jsonb,
  p_dedupe_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.challenges%rowtype;
begin
  if p_owner_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_status not in ('completed_success', 'completed_failure') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_activity_kind not in ('challenge_succeeded', 'challenge_failed') then
    raise exception 'invalid activity kind' using errcode = '22023';
  end if;
  if p_activity_payload is null or jsonb_typeof(p_activity_payload) <> 'object' then
    raise exception 'activity payload is invalid' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_dedupe_key)), 0) = 0 then
    raise exception 'a dedupe key is required' using errcode = '22023';
  end if;

  select * into v_challenge from public.challenges where id = p_challenge_id and owner_id = p_owner_id for update;
  if not found then
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

  if v_challenge.challenge_status in ('completed_success', 'completed_failure') then
    return jsonb_build_object('status', v_challenge.challenge_status, 'alreadyFinalized', true);
  end if;
  if v_challenge.challenge_status <> 'awaiting_resolution' then
    raise exception 'challenge must have ended before it can be finalized' using errcode = '22023';
  end if;

  update public.challenges set challenge_status = p_status, completed_at = now() where id = p_challenge_id;

  insert into public.social_activity (owner_id, challenge_id, kind, payload, dedupe_key)
  values (p_owner_id, p_challenge_id, p_activity_kind, p_activity_payload, p_dedupe_key)
  on conflict (owner_id, dedupe_key) do nothing;

  return jsonb_build_object('status', p_status, 'alreadyFinalized', false);
end;
$$;

revoke all on function public.finalize_challenge_result(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.finalize_challenge_result(uuid, uuid, text, text, jsonb, text) to service_role;

-- prepare_challenge_from_draft and activate_challenge_draft: widen both
-- guards from PR #31 to also cover 'awaiting_resolution' -- an unresolved
-- ended challenge blocks a new one exactly like a genuinely active one.
create or replace function public.prepare_challenge_from_draft(draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  draft public.challenge_drafts%rowtype;
  existing_id uuid;
  existing_status text;
  new_challenge_id uuid;
  recipients jsonb;
  recipient_count integer;
  distinct_recipient_count integer;
  organizer_type text;
  organizer_recipient_id text;
  organizer_name text;
  experience_category text;
  duration_unit text;
  duration_value integer;
  stake_minor_units bigint;
  stake_currency text;
  recipient jsonb;
  recipient_ordinal bigint;
  rule_direction text;
  rule_measurement_type text;
  rhythm_type text;
  rhythm_period_unit text;
  rhythm_target integer;
  boundary_period_unit text;
  boundary_max_value numeric;
  boundary_max_lapses integer;
  success_direction text;
  success_rule_version integer;
  success_period_target integer;
  success_period_unit text;
  success_total_planned integer;
  success_min_required integer;
  success_safeguard_type text;
  success_measurement_type text;
  success_max_allowed numeric;
  success_total_periods integer;
  success_min_periods_within_limit integer;
  success_lapse_type text;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select id, challenge_status into existing_id, existing_status
    from public.challenges
    where source_draft_id = draft_id and owner_id = caller;
  if existing_id is not null then
    return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
  end if;

  select * into draft
    from public.challenge_drafts
    where id = draft_id and owner_id = caller
    for update;
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  select id, challenge_status into existing_id, existing_status
    from public.challenges
    where source_draft_id = draft_id and owner_id = caller;
  if existing_id is not null then
    return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
  end if;

  if exists (
    select 1 from public.challenges
    where owner_id = caller and challenge_status = 'pending_activation'
  ) then
    raise exception 'another pending commitment already exists; cancel it before preparing a new one' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.challenges
    where owner_id = caller and challenge_status in ('active', 'completion_mode', 'awaiting_resolution')
  ) then
    raise exception 'you already have an active challenge; finish or resolve it before starting another' using errcode = '22023';
  end if;

  if draft.draft_status <> 'ready_for_activation' then
    raise exception 'draft is not ready for activation' using errcode = '22023';
  end if;

  if coalesce(length(btrim(draft.draft_payload ->> 'goal')), 0) < 3 then
    raise exception 'goal is incomplete' using errcode = '22023';
  end if;
  if coalesce(length(btrim(draft.draft_payload #>> '{behavior,description}')), 0) < 3 then
    raise exception 'behavior description is incomplete' using errcode = '22023';
  end if;
  if coalesce(length(btrim(draft.draft_payload #>> '{behavior,completionDefinition}')), 0) < 3 then
    raise exception 'completion definition is incomplete' using errcode = '22023';
  end if;

  duration_unit := draft.draft_payload #>> '{duration,unit}';
  begin
    duration_value := (draft.draft_payload #>> '{duration,value}')::integer;
  exception when others then
    raise exception 'duration is invalid' using errcode = '22023';
  end;
  if duration_unit is distinct from 'week' or duration_value is null
    or duration_value < 2 or duration_value > 12 then
    raise exception 'duration must be between 2 and 12 whole weeks' using errcode = '22023';
  end if;

  rule_direction := draft.draft_payload #>> '{behavior,rule,direction}';
  success_direction := draft.draft_payload #>> '{successRule,direction}';
  if rule_direction not in ('build', 'cut_back', 'stop') then
    raise exception 'behavior rule direction is invalid' using errcode = '22023';
  end if;
  if success_direction is distinct from rule_direction then
    raise exception 'successRule direction must match the behavior rule' using errcode = '22023';
  end if;
  begin
    success_rule_version := (draft.draft_payload #>> '{successRule,ruleVersion}')::integer;
  exception when others then
    raise exception 'successRule.ruleVersion is invalid' using errcode = '22023';
  end;
  if success_rule_version is distinct from 1 then
    raise exception 'unsupported successRule.ruleVersion' using errcode = '22023';
  end if;

  case rule_direction
    when 'build' then
      rule_measurement_type := draft.draft_payload #>> '{behavior,rule,measurement,type}';
      rhythm_type := draft.draft_payload #>> '{behavior,rule,rhythm,type}';
      rhythm_period_unit := draft.draft_payload #>> '{behavior,rule,rhythm,periodUnit}';
      begin
        rhythm_target := (draft.draft_payload #>> '{behavior,rule,rhythm,target}')::integer;
      exception when others then
        raise exception 'build rhythm target is invalid' using errcode = '22023';
      end;
      if rule_measurement_type is distinct from 'completion' then
        raise exception 'build rule requires completion measurement' using errcode = '22023';
      end if;
      if rhythm_type not in ('daily', 'weekly_count', 'specific_days') or rhythm_target is null or rhythm_target <= 0 then
        raise exception 'build rhythm is invalid' using errcode = '22023';
      end if;
      if rhythm_type = 'daily' and (rhythm_period_unit is distinct from 'day' or rhythm_target <> 1) then
        raise exception 'daily build rhythm must target exactly 1 per day' using errcode = '22023';
      end if;
      if rhythm_type in ('weekly_count', 'specific_days') and rhythm_period_unit is distinct from 'week' then
        raise exception 'weekly build rhythm must use a week period unit' using errcode = '22023';
      end if;
      if rhythm_type = 'specific_days' and (
        jsonb_typeof(draft.draft_payload #> '{behavior,rule,rhythm,weekdays}') is distinct from 'array'
        or jsonb_array_length(draft.draft_payload #> '{behavior,rule,rhythm,weekdays}') < 1
      ) then
        raise exception 'specific_days build rhythm requires at least one weekday' using errcode = '22023';
      end if;

      begin
        success_period_target := (draft.draft_payload #>> '{successRule,periodTarget}')::integer;
        success_total_planned := (draft.draft_payload #>> '{successRule,totalPlannedCompletions}')::integer;
        success_min_required := (draft.draft_payload #>> '{successRule,minimumRequiredCompletions}')::integer;
      exception when others then
        raise exception 'build successRule fields are invalid' using errcode = '22023';
      end;
      success_period_unit := draft.draft_payload #>> '{successRule,periodUnit}';
      success_safeguard_type := draft.draft_payload #>> '{successRule,continuitySafeguard,type}';
      if success_period_target is distinct from rhythm_target or success_period_unit is distinct from rhythm_period_unit then
        raise exception 'build successRule must match the rhythm target and period unit' using errcode = '22023';
      end if;
      if success_min_required is null or success_min_required <= 0
        or success_total_planned is null or success_total_planned < success_min_required then
        raise exception 'build successRule completion targets are invalid' using errcode = '22023';
      end if;
      if success_safeguard_type not in (
        'maximum_consecutive_missed_days', 'minimum_completions_per_week', 'maximum_consecutive_missed_weeks'
      ) then
        raise exception 'build successRule continuity safeguard is invalid' using errcode = '22023';
      end if;

    when 'cut_back' then
      rule_measurement_type := draft.draft_payload #>> '{behavior,rule,measurement,type}';
      boundary_period_unit := draft.draft_payload #>> '{behavior,rule,boundary,periodUnit}';
      begin
        boundary_max_value := (draft.draft_payload #>> '{behavior,rule,boundary,maximumValue}')::numeric;
      exception when others then
        raise exception 'cut_back boundary maximumValue is invalid' using errcode = '22023';
      end;
      if rule_measurement_type not in ('count', 'time', 'amount') then
        raise exception 'cut_back rule requires a count, time, or amount measurement' using errcode = '22023';
      end if;
      if boundary_period_unit not in ('day', 'week') or boundary_max_value is null or boundary_max_value <= 0 then
        raise exception 'cut_back boundary is invalid' using errcode = '22023';
      end if;

      begin
        success_max_allowed := (draft.draft_payload #>> '{successRule,maximumAllowedValue}')::numeric;
        success_total_periods := (draft.draft_payload #>> '{successRule,totalPeriods}')::integer;
        success_min_periods_within_limit := (draft.draft_payload #>> '{successRule,minimumPeriodsWithinLimit}')::integer;
      exception when others then
        raise exception 'cut_back successRule fields are invalid' using errcode = '22023';
      end;
      success_measurement_type := draft.draft_payload #>> '{successRule,measurementType}';
      success_period_unit := draft.draft_payload #>> '{successRule,periodUnit}';
      success_safeguard_type := draft.draft_payload #>> '{successRule,continuitySafeguard,type}';
      if success_measurement_type is distinct from rule_measurement_type
        or success_period_unit is distinct from boundary_period_unit
        or success_max_allowed is distinct from boundary_max_value then
        raise exception 'cut_back successRule must match the rule boundary' using errcode = '22023';
      end if;
      if success_total_periods is null or success_min_periods_within_limit is null
        or success_min_periods_within_limit <= 0 or success_min_periods_within_limit > success_total_periods then
        raise exception 'cut_back successRule adherence targets are invalid' using errcode = '22023';
      end if;
      if success_safeguard_type not in ('maximum_consecutive_exceeded_days', 'maximum_consecutive_exceeded_weeks') then
        raise exception 'cut_back successRule continuity safeguard is invalid' using errcode = '22023';
      end if;

    when 'stop' then
      rule_measurement_type := draft.draft_payload #>> '{behavior,rule,measurement,type}';
      boundary_period_unit := draft.draft_payload #>> '{behavior,rule,boundary,periodUnit}';
      begin
        boundary_max_lapses := (draft.draft_payload #>> '{behavior,rule,boundary,maximumLapses}')::integer;
      exception when others then
        raise exception 'stop boundary maximumLapses is invalid' using errcode = '22023';
      end;
      if rule_measurement_type is distinct from 'abstinence' then
        raise exception 'stop rule requires an abstinence measurement' using errcode = '22023';
      end if;
      if boundary_period_unit is distinct from 'challenge' or boundary_max_lapses is distinct from 0 then
        raise exception 'v1 stop challenges require a zero-lapse, whole-challenge boundary' using errcode = '22023';
      end if;

      success_lapse_type := draft.draft_payload #>> '{successRule,lapseRule,type}';
      if success_lapse_type is distinct from 'zero_lapses' then
        raise exception 'v1 stop successRule requires the zero_lapses rule' using errcode = '22023';
      end if;
  end case;

  recipients := coalesce(draft.draft_payload -> 'recipients', '[]'::jsonb);
  if jsonb_typeof(recipients) <> 'array' then
    raise exception 'recipients are invalid' using errcode = '22023';
  end if;
  select count(*), count(distinct elem.value ->> 'id')
    into recipient_count, distinct_recipient_count
    from jsonb_array_elements(recipients) as elem(value);
  if recipient_count < 1 or recipient_count > 4 then
    raise exception 'between one and four recipients are required' using errcode = '22023';
  end if;
  if distinct_recipient_count <> recipient_count then
    raise exception 'recipient identities must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(recipients) as elem(value)
    where coalesce(length(btrim(elem.value ->> 'name')), 0) not between 1 and 50
       or coalesce(length(btrim(elem.value ->> 'id')), 0) < 1
  ) then
    raise exception 'every recipient needs a valid name' using errcode = '22023';
  end if;

  organizer_type := draft.draft_payload #>> '{rewardOrganizer,type}';
  if organizer_type = 'recipient' then
    organizer_recipient_id := draft.draft_payload #>> '{rewardOrganizer,recipientId}';
    if not exists (
      select 1 from jsonb_array_elements(recipients) as elem(value)
      where elem.value ->> 'id' = organizer_recipient_id
    ) then
      raise exception 'the organizer must reference a challenge recipient' using errcode = '22023';
    end if;
  elsif organizer_type = 'other' then
    organizer_name := draft.draft_payload #>> '{rewardOrganizer,name}';
    if coalesce(length(btrim(organizer_name)), 0) not between 1 and 50 then
      raise exception 'the organizer name is invalid' using errcode = '22023';
    end if;
  else
    raise exception 'a reward organizer is required' using errcode = '22023';
  end if;

  experience_category := draft.draft_payload ->> 'experienceCategory';
  if experience_category is null
    or experience_category not in ('adventure', 'culture', 'dinner', 'getaway', 'wellness') then
    raise exception 'an experience category is required' using errcode = '22023';
  end if;

  begin
    stake_minor_units := (draft.draft_payload #>> '{stake,minorUnits}')::bigint;
  exception when others then
    raise exception 'stake is invalid' using errcode = '22023';
  end;
  stake_currency := draft.draft_payload #>> '{stake,currency}';
  if stake_minor_units is null or stake_minor_units <= 0 then
    raise exception 'the stake must be a positive amount' using errcode = '22023';
  end if;
  if stake_currency is distinct from 'USD' then
    raise exception 'the selected currency is not supported' using errcode = '22023';
  end if;

  if (draft.draft_payload -> 'sitOutAcknowledged') is distinct from 'true'::jsonb then
    raise exception 'the sit-out promise must be acknowledged' using errcode = '22023';
  end if;

  if coalesce(length(btrim(draft.draft_payload ->> 'invitationMessage')), 0) < 3 then
    raise exception 'a valid invitation message is required' using errcode = '22023';
  end if;

  if draft.draft_payload ->> 'membershipSelection' is distinct from 'monthly_trial' then
    raise exception 'a membership selection is required' using errcode = '22023';
  end if;

  new_challenge_id := gen_random_uuid();
  begin
    insert into public.challenges (
      id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status
    ) values (
      new_challenge_id, caller, draft_id, draft.schema_version, 1, 'pending_activation'
    );
  exception when unique_violation then
    select id, challenge_status into existing_id, existing_status
      from public.challenges where source_draft_id = draft_id and owner_id = caller;
    if existing_id is not null then
      return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
    end if;
    raise exception 'another pending commitment already exists; cancel it before preparing a new one' using errcode = '22023';
  end;

  recipient_ordinal := 0;
  for recipient in select elem.value from jsonb_array_elements(recipients) as elem(value) loop
    insert into public.challenge_recipients (
      challenge_id, display_name, sort_order, recipient_role
    ) values (
      new_challenge_id,
      btrim(recipient ->> 'name'),
      recipient_ordinal,
      case when recipient ->> 'id' = organizer_recipient_id then 'recipient_organizer' else 'recipient' end
    );
    recipient_ordinal := recipient_ordinal + 1;
  end loop;

  insert into public.consequences (
    id, challenge_id, owner_id, status, stake_minor_units, currency
  ) values (
    gen_random_uuid(), new_challenge_id, caller, 'payment_method_required', stake_minor_units, stake_currency
  );

  update public.challenge_drafts set draft_status = 'archived' where id = draft_id;

  return jsonb_build_object('challengeId', new_challenge_id, 'status', 'pending_activation');
end;
$$;

revoke all on function public.prepare_challenge_from_draft(uuid) from public, anon, authenticated;
grant execute on function public.prepare_challenge_from_draft(uuid) to authenticated;

create or replace function public.activate_challenge_draft(challenge_id uuid, activation_timezone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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
    raise exception 'challenge not found' using errcode = 'P0002';
  end if;

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

  if exists (
    select 1 from public.challenges
    where owner_id = caller and challenge_status in ('active', 'completion_mode', 'awaiting_resolution') and id <> target_id
  ) then
    raise exception 'you already have a different active challenge; finish or resolve it before activating another' using errcode = '22023';
  end if;

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

  v_period_result := private.generate_challenge_periods(target_id, v_activation_instant, activation_timezone);
  v_starts_at := (v_period_result ->> 'startsAt')::timestamptz;
  v_planned_ends_at := (v_period_result ->> 'plannedEndsAt')::timestamptz;

  begin
    update public.challenges set
      challenge_status = 'active',
      timezone = activation_timezone,
      activated_at = v_activation_instant,
      starts_at = v_starts_at,
      planned_ends_at = v_planned_ends_at,
      activation_snapshot = v_snapshot
    where id = target_id;
  exception when unique_violation then
    raise exception 'you already have a different active challenge; finish or resolve it before activating another' using errcode = '22023';
  end;

  return jsonb_build_object(
    'challengeId', target_id, 'status', 'active',
    'startsAt', v_starts_at, 'plannedEndsAt', v_planned_ends_at
  );
end;
$$;

revoke all on function public.activate_challenge_draft(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_challenge_draft(uuid, text) to authenticated;

-- private.canonical_current_challenges (20260818000000): still only ever
-- 'active' rows (an ended-but-unresolved challenge is no longer ordinary
-- in-progress activity, so it correctly stops being "current" the moment
-- it would be reconciled) -- but this adds a defensive, read-time-only
-- time filter so a Kin never sees a challenge as "current" even in the
-- narrow window before the write-side reconciliation has actually run.
-- Never writes; the real persisted transition still only happens via
-- reconcile_challenge_lifecycle (called from finalize-challenge). Only
-- excludes a row when there is positive evidence its window has closed
-- (a real period exists whose reporting_closes_at has passed) -- a
-- genuinely active challenge always has real generated periods (see
-- private.generate_challenge_periods, called at activation), so the "no
-- periods at all" case never happens outside of missing/malformed data,
-- which this view must never interpret as "already ended".
create or replace view private.canonical_current_challenges as
select distinct on (owner_id) c.*
from public.challenges c
where c.challenge_status = 'active'
  and not exists (
    select 1 from public.challenge_periods p
    where p.challenge_id = c.id
    having max(p.reporting_closes_at) < now()
  )
order by c.owner_id, c.activated_at desc;
