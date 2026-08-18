-- Exercises private.generate_challenge_periods (20260809000000, redefined by
-- 20260905000000 to start the first period today rather than tomorrow): the
-- trusted, deterministic period generator designed to be called from the
-- future full-activation transaction. Every fixture here is inserted
-- directly as service_role (bypassing prepare_challenge_from_draft, which
-- is exercised separately in 090_) with its own freshly generated owner, so
-- these cases never collide with challenges_owner_one_pending_idx or with
-- any other file's fixtures.
--
-- Europe/Stockholm's real DST transitions are used throughout so the
-- boundary arithmetic is checked against the server's actual IANA tzdata,
-- not a hand-rolled approximation: 2027-03-28 (spring forward, CET->CEST)
-- is a 23-UTC-hour local day, and 2026-10-25 (autumn back, CEST->CET) is a
-- 25-UTC-hour local day. America/Santiago's 2026-09-06 transition (added
-- in review) additionally covers the narrower nonexistent-local-midnight
-- case, where a zone's spring-forward happens at exactly local midnight.
-- Activation instants for the two DST-edge cases below are computed with
-- `at time zone` (never a hand-written UTC offset literal) so the actual
-- server tzdata resolves the real offset either side of each transition.

set role service_role;

-- Daily Build periods, deliberately activated ON the spring-forward
-- transition day itself (after the 02:00->03:00 local gap) so the first
-- generated period — today, under starts-today semantics — is the 23-hour
-- day.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-daily-build@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  select private.generate_challenge_periods(v_challenge, (timestamp '2027-03-28 12:00:00' at time zone 'Europe/Stockholm'), 'Europe/Stockholm') into v_result;

  perform test.assert_equals('daily_build_period_count', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 14::bigint);
  perform test.assert_equals('daily_build_all_period_kind_day',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge and period_kind <> 'day'), 0::bigint);
  perform test.assert_equals('daily_build_target_payload',
    (select target_payload from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    jsonb_build_object('type', 'completion_target', 'target', 1));
  -- Spring-forward day: 2027-03-28 00:00 local -> 2027-03-29 00:00 local spans only 23 UTC hours.
  perform test.assert_equals('daily_build_spring_dst_23h_day',
    (select ends_at - starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    interval '23:00:00');
  perform test.assert_equals('daily_build_final_boundary_matches_planned_ends_at',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge and period_number = 14),
    (v_result ->> 'plannedEndsAt')::timestamptz);
end;
$$;

-- Nonexistent-local-midnight policy (review finding): America/Santiago runs
-- its spring-forward transition at exactly local midnight on 2026-09-06, so
-- "00:00:00" that day is not a real instant. The documented policy (see the
-- comment above `v_local_start` in the migration) is that such a boundary
-- resolves to the first valid local instant after the gap — proven here
-- against the server's real tzdata, not asserted from a hand-written
-- expectation, plus that this never creates a gap or overlap between the
-- periods on either side of it.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-nonexistent-midnight@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  -- This instant's own local calendar date (today, under starts-today
  -- semantics) is the nominal (nonexistent) 2026-09-06 00:00:00 America/
  -- Santiago boundary. Computed with `at time zone`, well after the
  -- 00:00-01:00 gap, so it is itself a real, unambiguous instant.
  select private.generate_challenge_periods(v_challenge, (timestamp '2026-09-06 10:00:00' at time zone 'America/Santiago'), 'America/Santiago') into v_result;

  -- The nominal local midnight does not round-trip back to 00:00:00 — proof
  -- this specific day really does hit the gap, not a false positive.
  perform test.assert_true('nonexistent_midnight_nominal_value_does_not_round_trip',
    (timestamp '2026-09-06 00:00:00' at time zone 'America/Santiago') at time zone 'America/Santiago' <> timestamp '2026-09-06 00:00:00');

  -- The documented policy: the boundary resolves to the first valid local
  -- instant after the gap (01:00, i.e. UTC 04:00 that day), not 00:00.
  perform test.assert_equals('nonexistent_midnight_boundary_resolves_past_the_gap',
    (select starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    '2026-09-06 04:00:00+00'::timestamptz);
  perform test.assert_equals('nonexistent_midnight_starts_at_matches_result',
    (select starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    (v_result ->> 'startsAt')::timestamptz);

  -- The gap shrinks that one period to 23 hours, same mechanism as an
  -- ordinary mid-day DST transition.
  perform test.assert_equals('nonexistent_midnight_period_is_23_hours',
    (select ends_at - starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    interval '23:00:00');

  -- No gap or overlap: the affected period's end is exactly the next
  -- period's start, both independently derived from the same deterministic
  -- per-boundary conversion.
  perform test.assert_equals('nonexistent_midnight_no_gap_or_overlap_with_next_period',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    (select starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 2));

  perform test.assert_equals('nonexistent_midnight_period_count_unaffected', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 14::bigint);
end;
$$;

-- Weekly Build periods (weekly_count rhythm), spanning the autumn DST
-- transition so one week is 25 hours longer than the other two, and every
-- boundary — including the DST week's — still lands on true local midnight.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-weekly-build@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'weekly_count', 'periodUnit', 'week', 'target', 3))),
      'duration', jsonb_build_object('unit', 'week', 'value', 3),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 9, 'minimumRequiredCompletions', 7,
        'continuitySafeguard', jsonb_build_object('type', 'minimum_completions_per_week', 'minimum', 1), 'periodTarget', 3, 'periodUnit', 'week'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  -- This instant's own local calendar date is 2026-10-17, so week 1 runs
  -- 2026-10-17 -> 2026-10-24 and week 2 (2026-10-24 -> 2026-10-31) contains
  -- the autumn transition.
  select private.generate_challenge_periods(v_challenge, '2026-10-17 12:00:00+02'::timestamptz, 'Europe/Stockholm') into v_result;

  perform test.assert_equals('weekly_build_period_count', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 3::bigint);
  perform test.assert_equals('weekly_build_all_period_kind_week',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge and period_kind <> 'week'), 0::bigint);
  perform test.assert_equals('weekly_build_target_payload',
    (select target_payload from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    jsonb_build_object('type', 'completion_target', 'target', 3));
  -- The DST week itself: 7 local days, but 7*24+1 UTC hours because of the
  -- autumn fallback inside it.
  perform test.assert_equals('weekly_build_autumn_dst_week_span',
    (select ends_at - starts_at from public.challenge_periods where challenge_id = v_challenge and period_number = 2),
    interval '7 days 01:00:00');
  -- Every boundary, including the DST week's own, is exactly local midnight.
  perform test.assert_equals('weekly_build_boundaries_all_local_midnight',
    (select count(*) from public.challenge_periods
      where challenge_id = v_challenge
        and (extract(hour from (starts_at at time zone 'Europe/Stockholm')), extract(minute from (starts_at at time zone 'Europe/Stockholm')),
             extract(hour from (ends_at at time zone 'Europe/Stockholm')), extract(minute from (ends_at at time zone 'Europe/Stockholm')))
          <> (0, 0, 0, 0)),
    0::bigint);
  perform test.assert_equals('weekly_build_final_boundary_matches_planned_ends_at',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge and period_number = 3),
    (v_result ->> 'plannedEndsAt')::timestamptz);
end;
$$;

-- Daily Cut back periods (day boundary), plus identical-repeat idempotency
-- and conflicting-repeat rejection against the same challenge.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result1 jsonb;
  v_result2 jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-daily-cutback@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Less screen time',
      'behavior', jsonb_build_object('description', 'Phone use', 'completionDefinition', 'Stay under the daily limit',
        'rule', jsonb_build_object('direction', 'cut_back', 'measurement', jsonb_build_object('type', 'time', 'unit', 'minutes'),
          'boundary', jsonb_build_object('periodUnit', 'day', 'maximumValue', 120))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 1, 'measurementType', 'time', 'maximumAllowedValue', 120,
        'periodUnit', 'day', 'totalPeriods', 14, 'minimumPeriodsWithinLimit', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_exceeded_days', 'maximum', 2)),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  select private.generate_challenge_periods(v_challenge, '2026-08-04 10:00:00+02'::timestamptz, 'Europe/Stockholm') into v_result1;

  perform test.assert_equals('daily_cutback_period_count', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 14::bigint);
  perform test.assert_equals('daily_cutback_all_period_kind_day',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge and period_kind <> 'day'), 0::bigint);
  perform test.assert_equals('daily_cutback_target_payload',
    (select target_payload from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    jsonb_build_object('type', 'maximum_value', 'maximum', 120, 'measurement', jsonb_build_object('type', 'time', 'unit', 'minutes')));
  perform test.assert_equals('daily_cutback_final_boundary_matches_planned_ends_at',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge and period_number = 14),
    (v_result1 ->> 'plannedEndsAt')::timestamptz);

  -- Identical repeat: same activation instant and timezone returns the same
  -- result and does not create any additional rows.
  select private.generate_challenge_periods(v_challenge, '2026-08-04 10:00:00+02'::timestamptz, 'Europe/Stockholm') into v_result2;
  perform test.assert_equals('daily_cutback_idempotent_repeat_same_result', v_result2, v_result1);
  perform test.assert_equals('daily_cutback_idempotent_repeat_no_duplicate_rows',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 14::bigint);

  -- Conflicting repeat: a different timezone for the same challenge is
  -- rejected outright rather than silently replacing the existing periods.
  perform test.assert_fails('daily_cutback_conflicting_repeat_rejected',
    format('select private.generate_challenge_periods(%L::uuid, %L::timestamptz, %L)',
      v_challenge, '2026-08-04 10:00:00+02'::timestamptz, 'America/New_York'),
    '23505');
  perform test.assert_equals('daily_cutback_conflicting_repeat_leaves_periods_unchanged',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 14::bigint);
end;
$$;

-- Weekly Cut back periods (week boundary).
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-weekly-cutback@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Spend less',
      'behavior', jsonb_build_object('description', 'Coffee shop spend', 'completionDefinition', 'Stay under the weekly budget',
        'rule', jsonb_build_object('direction', 'cut_back', 'measurement', jsonb_build_object('type', 'amount', 'unit', 'USD'),
          'boundary', jsonb_build_object('periodUnit', 'week', 'maximumValue', 50))),
      'duration', jsonb_build_object('unit', 'week', 'value', 4),
      'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 1, 'measurementType', 'amount', 'maximumAllowedValue', 50,
        'periodUnit', 'week', 'totalPeriods', 4, 'minimumPeriodsWithinLimit', 3,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_exceeded_weeks', 'maximum', 1)),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  select private.generate_challenge_periods(v_challenge, now(), 'Europe/Stockholm') into v_result;

  perform test.assert_equals('weekly_cutback_period_count', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 4::bigint);
  perform test.assert_equals('weekly_cutback_all_period_kind_week',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge and period_kind <> 'week'), 0::bigint);
  perform test.assert_equals('weekly_cutback_target_payload',
    (select target_payload from public.challenge_periods where challenge_id = v_challenge and period_number = 1),
    jsonb_build_object('type', 'maximum_value', 'maximum', 50, 'measurement', jsonb_build_object('type', 'amount', 'unit', 'USD')));
  perform test.assert_equals('weekly_cutback_final_boundary_matches_planned_ends_at',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge and period_number = 4),
    (v_result ->> 'plannedEndsAt')::timestamptz);
end;
$$;

-- One continuous Stop period covering the whole challenge.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'periods-stop@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner,
      'goal', 'Quit smoking',
      'behavior', jsonb_build_object('description', 'No cigarettes', 'completionDefinition', 'Zero cigarettes',
        'rule', jsonb_build_object('direction', 'stop', 'measurement', jsonb_build_object('type', 'abstinence', 'unit', 'lapse'),
          'boundary', jsonb_build_object('periodUnit', 'challenge', 'maximumLapses', 0))),
      'duration', jsonb_build_object('unit', 'week', 'value', 6),
      'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1, 'lapseRule', jsonb_build_object('type', 'zero_lapses')),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  select private.generate_challenge_periods(v_challenge, now(), 'Europe/Stockholm') into v_result;

  perform test.assert_equals('stop_period_count', (select count(*) from public.challenge_periods where challenge_id = v_challenge), 1::bigint);
  perform test.assert_equals('stop_period_kind', (select period_kind from public.challenge_periods where challenge_id = v_challenge), 'continuous');
  perform test.assert_equals('stop_period_number', (select period_number from public.challenge_periods where challenge_id = v_challenge), 1);
  perform test.assert_equals('stop_target_payload',
    (select target_payload from public.challenge_periods where challenge_id = v_challenge),
    jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));
  perform test.assert_equals('stop_starts_at_matches_result',
    (select starts_at from public.challenge_periods where challenge_id = v_challenge), (v_result ->> 'startsAt')::timestamptz);
  perform test.assert_equals('stop_final_boundary_matches_planned_ends_at',
    (select ends_at from public.challenge_periods where challenge_id = v_challenge), (v_result ->> 'plannedEndsAt')::timestamptz);
end;
$$;

-- Unknown IANA timezone is rejected before any row is touched.
select test.assert_fails('invalid_timezone_rejected',
  format('select private.generate_challenge_periods(gen_random_uuid(), now(), %L)', 'Not/ARealZone'), '22023');
select test.assert_fails('empty_timezone_rejected',
  format('select private.generate_challenge_periods(gen_random_uuid(), now(), %L)', ''), '22023');

-- An unknown challenge id is rejected.
select test.assert_fails('unknown_challenge_rejected',
  format('select private.generate_challenge_periods(gen_random_uuid(), now(), %L)', 'Europe/Stockholm'), 'P0002');

-- A canceled, active, or completed commitment is rejected — periods may
-- only ever be generated for a still-pending one.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-active-rejected@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, activation_snapshot)
  values (
    v_challenge, v_owner, 1, 1, 'active', 'Europe/Stockholm', now(), now(), now() + interval '28 days',
    jsonb_build_object(
      'schemaVersion', 1, 'id', v_challenge, 'ownerId', v_owner, 'ruleEngineVersion', 1, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'consequenceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'membershipStatusAtActivation', 'trialing'
    )
  );
  perform test.assert_fails('active_challenge_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '22023');
  perform test.assert_equals('active_challenge_rejection_creates_no_periods',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 0::bigint);
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-canceled-rejected@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'canceled_before_activation');
  perform test.assert_fails('canceled_challenge_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '22023');
end;
$$;

-- Malformed commitments: a source draft that is not archived, and one whose
-- rule/duration content is not a real, evaluable shape — both satisfy
-- challenge_drafts' own coarse CHECK constraints but must still be rejected
-- here, the same "revalidate server-owned data" boundary
-- prepare_challenge_from_draft already applies at its own entry point.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-not-archived@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object('schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 4),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'),
    'ready_for_activation'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');
  perform test.assert_fails('draft_not_archived_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '22023');
  perform test.assert_equals('draft_not_archived_rejection_creates_no_periods',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 0::bigint);
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-malformed-rule@example.test');
  -- A bare {"direction":"build"} rule with no measurement/rhythm — passes
  -- challenge_drafts' own coarse "is a JSON object" CHECK constraint.
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object('schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build')),
      'duration', jsonb_build_object('unit', 'week', 'value', 4),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');
  perform test.assert_fails('malformed_rule_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '22023');
  perform test.assert_equals('malformed_rule_rejection_creates_no_periods',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 0::bigint);
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-malformed-duration@example.test');
  -- duration.value = 1 is below the 2-week minimum enforced server-side.
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object('schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 1),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 7, 'minimumRequiredCompletions', 5,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');
  perform test.assert_fails('malformed_duration_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '22023');
end;
$$;

-- Simulated failure leaves no partial periods: a pre-existing row that
-- collides with a period_number this call would otherwise generate forces
-- a unique_violation partway through the insert loop. Because the whole
-- function call is one top-level statement/transaction, every insert made
-- during that call — including the ones before the failing one — rolls
-- back, leaving only the pre-existing bogus row behind.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'periods-simulated-failure@example.test');
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    v_draft, v_owner, 1,
    jsonb_build_object('schemaVersion', 1, 'id', v_draft, 'ownerId', v_owner, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, v_draft, 1, 1, 'pending_activation');

  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 5, 'day', now(), now() + interval '1 day', now() + interval '2 days', jsonb_build_object('type', 'completion_target', 'target', 1));

  perform test.assert_fails('simulated_failure_rejected',
    format('select private.generate_challenge_periods(%L::uuid, now(), %L)', v_challenge, 'Europe/Stockholm'), '23505');

  perform test.assert_equals('simulated_failure_leaves_only_the_preexisting_row',
    (select count(*) from public.challenge_periods where challenge_id = v_challenge), 1::bigint);
  perform test.assert_equals('simulated_failure_leaves_no_generation_record',
    (select count(*) from private.challenge_period_generations where challenge_id = v_challenge), 0::bigint);
end;
$$;

reset role;

-- Direct anon/authenticated execution remains impossible: neither role has
-- USAGE on the `private` schema at all (see 050_private_schema_isolation.sql),
-- so this fails before any function-level grant is even considered.
set role anon;
select test.assert_fails('anon_cannot_call_generate_periods',
  format('select private.generate_challenge_periods(gen_random_uuid(), now(), %L)', 'Europe/Stockholm'), '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails('authenticated_cannot_call_generate_periods',
  format('select private.generate_challenge_periods(gen_random_uuid(), now(), %L)', 'Europe/Stockholm'), '42501');
reset role;
