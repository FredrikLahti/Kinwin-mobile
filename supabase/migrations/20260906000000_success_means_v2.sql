-- Success Means (successRule ruleVersion 2): lets a Build/Limit draft's
-- overall threshold be user-selected and STRICTER than Kinwin's computed
-- baseline — never weaker. See docs/PRODUCT_DECISIONS.md for the locked
-- product rule and domain/challenge/success-rule.ts for the client-side
-- domain model this mirrors (applySuccessThreshold/successThresholdBounds).
--
-- This migration ONLY redefines prepare_challenge_from_draft (via `create
-- or replace function`, same pattern as every prior redefinition of it —
-- see 20260904000000_account_deletion_service_role_rpc_and_locking.sql's
-- own header for why that's safe: PostgreSQL keeps one physical function
-- per signature, so this is an in-place body swap, not a new object, and
-- every existing GRANT/REVOKE on it stays intact). It does not touch
-- 20260905000000_activation_starts_today.sql or any other migration.
--
-- What changes, functionally:
--   1. successRule.ruleVersion now accepts 1 OR 2 for build/cut_back
--      (stop/Avoid stays ruleVersion-1-only: zero lapses cannot be made
--      "stricter", so a stop draft submitting ruleVersion 2 is rejected).
--   2. ruleVersion 1's validation is completely UNCHANGED — every existing
--      structural check (positive minimum, minimum <= total, etc.) stays
--      byte-for-byte as it was in 20260805000000/20260808000000/
--      20260904000000. This migration deliberately does NOT retroactively
--      tighten V1 to require exact baseline equality (even though the
--      client-side domain/challenge/validation.ts already does) — doing
--      so would reject pre-existing V1 drafts/fixtures that predate real
--      baseline enforcement, which is exactly the kind of unrelated
--      change and regression risk this package is scoped to avoid.
--   3. ruleVersion 2 ONLY: Kinwin's true baseline/total are independently
--      RE-DERIVED here from the draft's own duration + rhythm/boundary —
--      never trusted from the draft's own totalPlannedCompletions/
--      totalPeriods or minimumRequiredCompletions/minimumPeriodsWithinLimit
--      fields. The selected minimum must be >= the re-derived baseline and
--      <= the re-derived total (in addition to V1's existing structural
--      check, which still applies to every version). A malicious client
--      submitting a V2 payload with a selected value below the true
--      baseline (e.g. baseline=25/28, selected=10/28) is rejected here
--      regardless of what the client claims its own baseline or total to
--      be — the server never trusts a client-supplied baseline number,
--      only its own re-derivation.
--
-- Baseline formula parity with the JS domain layer
-- (domain/challenge/success-rule.ts's deriveSuccessRuleForChallengeRule):
--   total = periodUnit='day' ? durationWeeks*7 : rhythmTarget*durationWeeks   (build)
--   total = periodUnit='day' ? durationWeeks*7 : durationWeeks               (cut_back)
--   allowed = periodUnit='day'
--     ? max(1, round(total*0.1))
--     : total<4 ? 0 : max(1, floor(total*0.15))
--   baseline = total - allowed
--
-- The JS formula's only rounding call (Math.round, "round half up" for the
-- positive values that arise here) is reproduced below as the exact
-- integer expression greatest(1, (total+5)/10) — PostgreSQL integer
-- division truncates toward zero, which for a non-negative numerator is
-- floor(), so (total+5)/10 = floor(total/10 + 0.5) = round-half-up(total/10)
-- with zero floating-point involved on either side. Math.floor(total*0.15)
-- is reproduced as (total*15)/100, again exact integer division with no
-- floating point. Both were verified to reproduce the JS
-- Math.round/Math.floor output bit-for-bit across every total value that
-- can actually arise from a valid draft (durationWeeks 2-12, every
-- Build/Limit rhythm target 1-7) before this migration was written.
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
  derived_total integer;
  derived_allowed integer;
  derived_baseline integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  -- Same owner-level lock as private.delete_account_owned_data, same two
  -- keys: whichever of the two gets here first for this owner runs to
  -- completion (commit or rollback) before the other proceeds. See this
  -- migration's header comment for the full race this closes.
  perform pg_advisory_xact_lock(hashtext('kinwin_account_mutation'), hashtext(caller::text));

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
  if success_rule_version not in (1, 2) then
    raise exception 'unsupported successRule.ruleVersion' using errcode = '22023';
  end if;
  if rule_direction = 'stop' and success_rule_version <> 1 then
    raise exception 'stop challenges do not support successRule ruleVersion 2' using errcode = '22023';
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

      -- Independently re-derive Kinwin's baseline from duration + rhythm —
      -- see this migration's header comment for the formula and its JS
      -- parity verification. Never trust the draft's own numbers for this.
      -- Applied ONLY to ruleVersion 2: V1's existing structural check just
      -- below (success_min_required <= 0 / totalPlanned < minRequired) is
      -- left completely untouched — this migration must not retroactively
      -- tighten V1 validation, only add real enforcement for the new V2
      -- bounds a malicious client could otherwise exploit.
      if success_rule_version = 2 then
        derived_total := case when rhythm_period_unit = 'day' then duration_value * 7 else rhythm_target * duration_value end;
        derived_allowed := case
          when rhythm_period_unit = 'day' then greatest(1, (derived_total + 5) / 10)
          else case when derived_total < 4 then 0 else greatest(1, (derived_total * 15) / 100) end
        end;
        derived_baseline := derived_total - derived_allowed;
        if success_total_planned is distinct from derived_total then
          raise exception 'v2 build successRule totalPlannedCompletions must match Kinwin''s derived total' using errcode = '22023';
        end if;
        if success_min_required is null or success_min_required < derived_baseline or success_min_required > derived_total then
          raise exception 'v2 build successRule minimumRequiredCompletions must be between Kinwin''s baseline and the total' using errcode = '22023';
        end if;
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

      -- Same independent re-derivation as build, above — applied ONLY to
      -- ruleVersion 2, leaving V1's existing structural check just below
      -- (minimumPeriodsWithinLimit <= 0 / > totalPeriods) untouched.
      if success_rule_version = 2 then
        derived_total := case when boundary_period_unit = 'day' then duration_value * 7 else duration_value end;
        derived_allowed := case
          when boundary_period_unit = 'day' then greatest(1, (derived_total + 5) / 10)
          else case when derived_total < 4 then 0 else greatest(1, (derived_total * 15) / 100) end
        end;
        derived_baseline := derived_total - derived_allowed;
        if success_total_periods is distinct from derived_total then
          raise exception 'v2 cut_back successRule totalPeriods must match Kinwin''s derived total' using errcode = '22023';
        end if;
        if success_min_periods_within_limit is null or success_min_periods_within_limit < derived_baseline
          or success_min_periods_within_limit > derived_total then
          raise exception 'v2 cut_back successRule minimumPeriodsWithinLimit must be between Kinwin''s baseline and the total' using errcode = '22023';
        end if;
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
