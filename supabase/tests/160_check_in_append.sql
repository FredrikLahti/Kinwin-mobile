-- Exercises public.append_check_in_event (20260812000000): the trusted,
-- service-role-only atomic write the append-check-in-event Edge Function
-- calls once it has already decided 'insert' via the real
-- domain/challenge/check-in/append-plan.ts contract (reused verbatim for
-- Deno at supabase/functions/_shared/check-in-engine/ -- see that
-- directory's file headers). This file only exercises the SQL function's
-- own defense-in-depth: ownership, active-challenge, period-membership, and
-- payload-shape validation, plus its own idempotency-key race handling --
-- not the append-plan.ts decision logic itself, which already has its own
-- extensive test suite (domain/challenge/check-in/append-plan.test.ts).
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;

do $$
declare
  v_period_id uuid;
begin
  insert into auth.users (id, email) values
    ('71111111-0000-0000-0000-000000000001', 'checkin-owner-a@example.test'),
    ('71111111-0000-0000-0000-000000000002', 'checkin-owner-b@example.test');

  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    '72222222-0000-0000-0000-000000000001', '71111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', '72222222-0000-0000-0000-000000000001', 'ownerId', '71111111-0000-0000-0000-000000000001',
      'goal', 'Feel stronger',
      'behavior', jsonb_build_object('description', 'Morning run', 'completionDefinition', 'Complete a run',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'archived'
  );

  -- A still-pending commitment, used below to prove check-ins are rejected
  -- against anything that is not yet active.
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('73333333-0000-0000-0000-000000000002', '71111111-0000-0000-0000-000000000001', '72222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');

  -- The real active challenge this file's success cases check in against --
  -- activated directly here (service_role) rather than by re-driving
  -- 150_full_activation.sql's flow, since this file only needs a real,
  -- already-active challenge with real periods, not a re-proof of
  -- activation itself.
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('73333333-0000-0000-0000-000000000001', '71111111-0000-0000-0000-000000000001', '72222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), '73333333-0000-0000-0000-000000000001', '71111111-0000-0000-0000-000000000001', 'authorized', 5000, 'USD', 'authorized', now());
  perform private.generate_challenge_periods('73333333-0000-0000-0000-000000000001', now(), 'Europe/Stockholm');
  update public.challenges set
    challenge_status = 'active',
    timezone = 'Europe/Stockholm',
    activated_at = now(),
    starts_at = (select starts_at from public.challenge_periods where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 1),
    planned_ends_at = (select ends_at from public.challenge_periods where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 14),
    activation_snapshot = jsonb_build_object(
      'id', '73333333-0000-0000-0000-000000000001', 'ownerId', '71111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Feel stronger',
      'behavior', jsonb_build_object('description', 'Morning run', 'completionDefinition', 'Complete a run',
        'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
          'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
        'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'consequenceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'membershipStatusAtActivation', 'trialing'
    )
    where id = '73333333-0000-0000-0000-000000000001';
end;
$$;
reset role;

-- Successful insert, called the way the Edge Function would (service_role,
-- explicit owner id): a real check_in_events row, matching the request.
set role service_role;
do $$
declare
  v_period_id uuid;
  v_result jsonb;
  v_row public.check_in_events%rowtype;
begin
  select id into v_period_id from public.challenge_periods
    where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 1;

  select public.append_check_in_event(
    '71111111-0000-0000-0000-000000000001', '73333333-0000-0000-0000-000000000001', v_period_id,
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1),
    'ios', now(), 'op-success-1'
  ) into v_result;

  perform test.assert_true('append_success_returns_event_id', (v_result ->> 'eventId') is not null);
  select * into v_row from public.check_in_events where id = (v_result ->> 'eventId')::uuid;
  perform test.assert_equals('append_success_event_type', v_row.event_type, 'build_completion');
  perform test.assert_equals('append_success_payload', v_row.event_payload, jsonb_build_object('kind', 'build_completion', 'completions', 1));
  perform test.assert_equals('append_success_idempotent_replay_false', (v_result ->> 'idempotentReplay')::boolean, false);
end;
$$;

-- A repeated call with the same idempotency key is handled gracefully --
-- returns the existing row instead of a raw unique-constraint error --
-- covering the race window the Edge Function's own pre-check cannot fully
-- close (see the migration's own comment on this).
do $$
declare
  v_period_id uuid;
  v_result jsonb;
  v_count bigint;
begin
  select id into v_period_id from public.challenge_periods
    where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 1;

  select public.append_check_in_event(
    '71111111-0000-0000-0000-000000000001', '73333333-0000-0000-0000-000000000001', v_period_id,
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1),
    'ios', now(), 'op-success-1'
  ) into v_result;

  perform test.assert_equals('append_duplicate_key_reports_idempotent_replay', (v_result ->> 'idempotentReplay')::boolean, true);
  select count(*) into v_count from public.check_in_events where challenge_id = '73333333-0000-0000-0000-000000000001' and idempotency_key = 'op-success-1';
  perform test.assert_equals('append_duplicate_key_creates_no_second_row', v_count, 1::bigint);
end;
$$;

-- Rejects a caller/owner mismatch (the Edge Function always derives
-- p_owner_id from a verified JWT, never the request body, but this proves
-- the function itself does not trust it blindly either).
do $$
declare
  v_period_id uuid;
begin
  select id into v_period_id from public.challenge_periods
    where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 2;
  perform test.assert_fails(
    'append_rejects_owner_mismatch',
    format(
      $stmt$select public.append_check_in_event('71111111-0000-0000-0000-000000000002'::uuid, '73333333-0000-0000-0000-000000000001'::uuid, %L::uuid, 'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-owner-mismatch')$stmt$,
      v_period_id
    ),
    'P0002'
  );
end;
$$;

-- Rejects a check-in against a challenge that is not active.
select test.assert_fails(
  'append_rejects_inactive_challenge',
  $stmt$select public.append_check_in_event(
    '71111111-0000-0000-0000-000000000001', '73333333-0000-0000-0000-000000000002',
    (select id from public.challenge_periods where challenge_id = '73333333-0000-0000-0000-000000000002' limit 1),
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-inactive'
  )$stmt$,
  'P0002'
);

-- Rejects a payload whose declared `kind` does not match the event type.
do $$
declare
  v_period_id uuid;
begin
  select id into v_period_id from public.challenge_periods
    where challenge_id = '73333333-0000-0000-0000-000000000001' and period_number = 3;
  perform test.assert_fails(
    'append_rejects_kind_mismatch',
    format(
      $stmt$select public.append_check_in_event('71111111-0000-0000-0000-000000000001'::uuid, '73333333-0000-0000-0000-000000000001'::uuid, %L::uuid, 'build_completion', jsonb_build_object('kind', 'cut_back_total', 'total', 1, 'unit', 'meals'), 'ios', now(), 'op-kind-mismatch')$stmt$,
      v_period_id
    ),
    '22023'
  );
end;
$$;

reset role;

-- Neither anon nor authenticated may call this directly -- only
-- service_role (the Edge Function), matching
-- 20260810000000_consequence_setup_stripe.sql's three RPCs.
set role authenticated;
select set_config('request.jwt.claim.sub', '71111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'authenticated_cannot_call_append_check_in_event_directly',
  $stmt$select public.append_check_in_event(
    '71111111-0000-0000-0000-000000000001', '73333333-0000-0000-0000-000000000001',
    (select id from public.challenge_periods where challenge_id = '73333333-0000-0000-0000-000000000001' limit 1),
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-authenticated-blocked'
  )$stmt$,
  '42501'
);
reset role;

set role anon;
select test.assert_fails(
  'anon_cannot_call_append_check_in_event',
  $stmt$select public.append_check_in_event(
    '71111111-0000-0000-0000-000000000001', '73333333-0000-0000-0000-000000000001',
    (select id from public.challenge_periods where challenge_id = '73333333-0000-0000-0000-000000000001' limit 1),
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-anon-blocked'
  )$stmt$,
  '42501'
);
reset role;
