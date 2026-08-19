-- True multi-currency V1 (docs/PRODUCT_DECISIONS.md): Kinwin's supported
-- commitment currencies expand from USD-only to exactly USD/SEK/EUR. There
-- is no FX conversion anywhere in Kinwin — the persisted challenge currency
-- IS the real commitment currency: a SEK challenge's stake, Stripe charge,
-- and Tremendous reward are all denominated in SEK, end to end. This
-- migration does not backfill or convert a single existing row — expanding
-- a CHECK constraint never mutates the rows it already accepted.
--
-- Three independent changes:
--   1. A new profiles.preferred_currency column — the DEFAULT currency for
--      NEW challenge drafts only (see lib/challenge-creation/currency-
--      default.ts). It is never a live reference an existing draft or
--      challenge reads from, and changing it has zero effect on any
--      existing draft, prepared challenge, or completed challenge.
--   2. The USD-only CHECK constraints on consequences.currency,
--      private.consequence_charge_attempts.currency, and
--      private.reward_fulfillments.currency widen to USD/SEK/EUR, mirroring
--      the drop/re-add pattern already used for activity_reactions_kind_check
--      in 20260907000000_activity_comments_and_emoji_reactions.sql.
--   3. public.prepare_challenge_from_draft is redefined (via `create or
--      replace function`, the same in-place body-swap pattern used by every
--      prior redefinition of it) with its full current body from
--      20260906000000_success_means_v2.sql, unchanged except for the single
--      currency validation line, which now accepts USD/SEK/EUR instead of
--      USD only. Every other rule (V2 Success Means, the owner-level
--      advisory lock, pending/active challenge conflicts, organizer/
--      duration/rhythm validation, server-authoritative preparation, and
--      the consequence/challenge_recipients inserts) is preserved exactly.
--
-- Once a draft is prepared into a real challenge (prepare_challenge_from_draft
-- succeeds), its currency is permanently locked into
-- challenges.activation_snapshot.stake.currency and consequences.currency —
-- neither is ever updated afterward (see challenges_protect_snapshot), and
-- activation (20260811000000_full_activation.sql) only ever copies the
-- draft's already-validated stake object through unchanged, so it needs no
-- changes here.

alter table public.profiles
  add column preferred_currency text check (preferred_currency is null or preferred_currency in ('USD', 'SEK', 'EUR'));

grant update (preferred_currency) on table public.profiles to authenticated;

alter table public.consequences drop constraint if exists consequences_currency_check;
alter table public.consequences
  add constraint consequences_currency_check check (currency in ('USD', 'SEK', 'EUR'));

alter table private.consequence_charge_attempts drop constraint if exists consequence_charge_attempts_currency_check;
alter table private.consequence_charge_attempts
  add constraint consequence_charge_attempts_currency_check check (currency in ('USD', 'SEK', 'EUR'));

alter table private.reward_fulfillments drop constraint if exists reward_fulfillments_currency_check;
alter table private.reward_fulfillments
  add constraint reward_fulfillments_currency_check check (currency in ('USD', 'SEK', 'EUR'));

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
  expected_safeguard_type text;
  expected_safeguard_value integer;
  success_safeguard_numeric integer;
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

        -- The continuity safeguard is UNCHANGED by a V2 selection (only the
        -- overall minimum differs from the baseline — see
        -- domain/challenge/success-rule.ts's applySuccessThreshold). The
        -- structural check below this block only ever validated the
        -- safeguard's `type` string, never its numeric maximum/minimum, so
        -- a V2 payload could otherwise submit e.g.
        -- maximum_consecutive_missed_days with maximum 999 and silently
        -- gut the safeguard while still passing every other check.
        expected_safeguard_type := case
          when rhythm_period_unit = 'day' then 'maximum_consecutive_missed_days'
          when rhythm_target >= 2 then 'minimum_completions_per_week'
          else 'maximum_consecutive_missed_weeks'
        end;
        if success_safeguard_type is distinct from expected_safeguard_type then
          raise exception 'v2 build successRule continuity safeguard type must match Kinwin''s baseline' using errcode = '22023';
        end if;
        begin
          success_safeguard_numeric := coalesce(
            (draft.draft_payload #>> '{successRule,continuitySafeguard,maximum}')::integer,
            (draft.draft_payload #>> '{successRule,continuitySafeguard,minimum}')::integer
          );
        exception when others then
          raise exception 'v2 build successRule continuity safeguard value is invalid' using errcode = '22023';
        end;
        expected_safeguard_value := case
          when expected_safeguard_type = 'maximum_consecutive_missed_days' then 2
          when expected_safeguard_type = 'maximum_consecutive_missed_weeks' then 1
          else rhythm_target - 1 -- minimum_completions_per_week
        end;
        if success_safeguard_numeric is distinct from expected_safeguard_value then
          raise exception 'v2 build successRule continuity safeguard value must match Kinwin''s baseline' using errcode = '22023';
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

        -- Same continuity-safeguard-value re-derivation as build, above —
        -- the structural check below only validates the safeguard's type.
        expected_safeguard_type := case when boundary_period_unit = 'day' then 'maximum_consecutive_exceeded_days' else 'maximum_consecutive_exceeded_weeks' end;
        if success_safeguard_type is distinct from expected_safeguard_type then
          raise exception 'v2 cut_back successRule continuity safeguard type must match Kinwin''s baseline' using errcode = '22023';
        end if;
        begin
          success_safeguard_numeric := (draft.draft_payload #>> '{successRule,continuitySafeguard,maximum}')::integer;
        exception when others then
          raise exception 'v2 cut_back successRule continuity safeguard value is invalid' using errcode = '22023';
        end;
        expected_safeguard_value := case when boundary_period_unit = 'day' then 2 else 1 end;
        if success_safeguard_numeric is distinct from expected_safeguard_value then
          raise exception 'v2 cut_back successRule continuity safeguard value must match Kinwin''s baseline' using errcode = '22023';
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
  if stake_currency not in ('USD', 'SEK', 'EUR') then
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
