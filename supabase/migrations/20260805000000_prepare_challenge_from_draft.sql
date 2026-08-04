-- Trusted server boundary that converts a completed editable draft into a
-- server-owned *pending* challenge package. This is deliberately narrower
-- than full activation (docs/BACKEND_IMPLEMENTATION_PLAN.md phase 3): it
-- creates `challenges.challenge_status = 'pending_activation'` with no
-- activation timestamps/timezone/snapshot, a client-invisible-write
-- `challenge_recipients` set, and a `consequences` row in an honest
-- pre-payment state. It never creates membership, payment authorization,
-- challenge periods, invitations, or an active status — those remain future
-- trusted work.

-- Tighten the existing source_draft_id index to enforce, at the database
-- level, that at most one challenge is ever prepared from a given draft —
-- the last line of defense against duplicate preparation even under a race
-- between two concurrent calls for the same draft (see the unique_violation
-- handler below).
drop index if exists public.challenges_source_draft_idx;
create unique index challenges_source_draft_idx
  on public.challenges (source_draft_id)
  where source_draft_id is not null;

create function public.prepare_challenge_from_draft(draft_id uuid)
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

  -- Idempotency fast path: a challenge already prepared from this draft
  -- (by this owner) returns the very same result instead of creating a
  -- duplicate or re-validating a now-archived draft.
  select id, challenge_status into existing_id, existing_status
    from public.challenges
    where source_draft_id = draft_id and owner_id = caller;
  if existing_id is not null then
    return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
  end if;

  -- Load the draft from the database — never from client-supplied contents
  -- — locking it against concurrent preparation attempts for the same draft.
  select * into draft
    from public.challenge_drafts
    where id = draft_id and owner_id = caller
    for update;
  if not found then
    -- Deliberately identical to a not-found error for a draft owned by
    -- someone else, so this never discloses whether a given draft id exists.
    raise exception 'draft not found' using errcode = 'P0002';
  end if;

  -- Re-check idempotency now that the row lock is held: while this call was
  -- waiting on `for update`, a concurrent call for the very same draft may
  -- already have committed — inserted the challenge, archived the draft,
  -- and released the lock. Without this, that lost race would fall through
  -- to the draft_status check below (now 'archived') and fail instead of
  -- returning the already-created challenge.
  select id, challenge_status into existing_id, existing_status
    from public.challenges
    where source_draft_id = draft_id and owner_id = caller;
  if existing_id is not null then
    return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
  end if;

  if draft.draft_status <> 'ready_for_activation' then
    raise exception 'draft is not ready for activation' using errcode = '22023';
  end if;

  -- Revalidate every required commitment field server-side. The client
  -- already enforces this (domain/challenge/validation.ts) before saving a
  -- draft as ready_for_activation, and challenge_drafts' own CHECK
  -- constraints enforce coarse shape, but neither can be trusted here: nothing
  -- stops draft_payload from having been left over from an older, looser
  -- shape or a not-yet-caught client bug. This block is the actual trust
  -- boundary, not a redundant formality.
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

  -- behavior.rule and successRule are structurally validated and cross-
  -- checked against each other, mirroring domain/challenge/validation.ts's
  -- validateRule. challenge_drafts' own CHECK constraints only confirm
  -- draft_payload.behavior.rule and .successRule exist as JSON objects —
  -- an empty or contradictory rule object (e.g. only {"direction":"build"})
  -- would otherwise pass through untouched and become an unactivatable,
  -- unevaluable server-owned commitment.
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

  -- All validation passed — atomically create the pending commitment
  -- package. Any error from here on aborts and rolls back the whole
  -- transaction (PostgREST runs each RPC call in its own transaction), so
  -- there is no state where only some of these rows exist.
  new_challenge_id := gen_random_uuid();
  begin
    insert into public.challenges (
      id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status
    ) values (
      new_challenge_id, caller, draft_id, draft.schema_version, 1, 'pending_activation'
    );
  exception when unique_violation then
    -- Lost a race against a concurrent call for the same draft: the other
    -- call already created the challenge (and, transactionally, everything
    -- below it too). Return its result instead of erroring or duplicating.
    select id, challenge_status into existing_id, existing_status
      from public.challenges where source_draft_id = draft_id and owner_id = caller;
    return jsonb_build_object('challengeId', existing_id, 'status', existing_status);
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

  -- Honest pre-payment state: no payment method has been collected yet, so
  -- this is neither a fake 'authorized' state nor a placeholder 'draft' —
  -- it names the very next real step in the flow.
  insert into public.consequences (
    id, challenge_id, owner_id, status, stake_minor_units, currency
  ) values (
    gen_random_uuid(), new_challenge_id, caller, 'payment_method_required', stake_minor_units, stake_currency
  );

  update public.challenge_drafts set draft_status = 'archived' where id = draft_id;

  return jsonb_build_object('challengeId', new_challenge_id, 'status', 'pending_activation');
end;
$$;

-- Minimum required execute permission: only signed-in clients preparing
-- their own draft may call this, never anon and never via a broader grant.
revoke all on function public.prepare_challenge_from_draft(uuid) from public, anon, authenticated;
grant execute on function public.prepare_challenge_from_draft(uuid) to authenticated;
