-- Exercises public.activate_challenge_draft (20260811000000): the trusted
-- full-activation RPC. NOT machine-verified against a real PostgreSQL
-- server as of this revision -- this dev environment had no local Postgres
-- or Docker available (see supabase/tests/README.md's own "Running"
-- section for the normal path). Written to the same conventions as the
-- rest of this suite; run supabase/tests/run.sh in an environment that has
-- a local PostgreSQL 16 server before trusting this migration against any
-- real project.
--
-- Fixed UUIDs throughout (not gen_random_uuid()) so `set_config`'s JWT
-- sub claim can reference the same owner across role switches, matching
-- 090_prepare_challenge_from_draft.sql's convention.

set role service_role;

do $$
begin
  insert into auth.users (id, email) values
    ('61111111-0000-0000-0000-000000000001', 'activation-owner-a@example.test'),
    ('61111111-0000-0000-0000-000000000002', 'activation-owner-b@example.test');

  -- Owner A: one pending commitment, payment not yet authorized.
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    '62222222-0000-0000-0000-000000000001', '61111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', '62222222-0000-0000-0000-000000000001', 'ownerId', '61111111-0000-0000-0000-000000000001',
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
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('63333333-0000-0000-0000-000000000001', '61111111-0000-0000-0000-000000000001', '62222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status)
    values (gen_random_uuid(), '63333333-0000-0000-0000-000000000001', '61111111-0000-0000-0000-000000000001', 'payment_method_required', 5000, 'USD', 'not_requested');
end;
$$;
reset role;

-- The payment gate: activation must be rejected while authorization_status
-- is anything other than 'authorized', and must not partially activate.
set role authenticated;
select set_config('request.jwt.claim.sub', '61111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'activation_rejected_without_payment_authorization',
  $stmt$select public.activate_challenge_draft('63333333-0000-0000-0000-000000000001', 'Europe/Stockholm')$stmt$,
  '22023'
);
reset role;
set role service_role;
do $$
declare
  status_val text;
  period_count bigint;
begin
  select challenge_status into status_val from public.challenges where id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('unauthorized_activation_leaves_challenge_pending', status_val, 'pending_activation');
  select count(*) into period_count from public.challenge_periods where challenge_id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('unauthorized_activation_creates_no_periods', period_count, 0::bigint);

  -- Simulate a verified webhook having authorized payment (the real path is
  -- supabase/functions/stripe-consequence-webhook, exercised separately in
  -- 140_consequence_setup_stripe.sql) so activation's own gate can be
  -- proven independently of that flow.
  update public.consequences set authorization_status = 'authorized', authorized_at = now()
    where challenge_id = '63333333-0000-0000-0000-000000000001';
end;
$$;
reset role;

-- Successful activation: real periods, real reporting_closes_at, an
-- activation_snapshot matching the archived draft, and the immutable
-- fields all written atomically.
set role authenticated;
select set_config('request.jwt.claim.sub', '61111111-0000-0000-0000-000000000001', false);
select public.activate_challenge_draft('63333333-0000-0000-0000-000000000001', 'Europe/Stockholm');
reset role;
set role service_role;
do $$
declare
  v_challenge public.challenges%rowtype;
  v_period_count bigint;
  v_gap interval;
begin
  select * into v_challenge from public.challenges where id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('activated_challenge_status', v_challenge.challenge_status, 'active');
  perform test.assert_true('activated_challenge_has_timestamps',
    v_challenge.activated_at is not null and v_challenge.starts_at is not null and v_challenge.planned_ends_at is not null);
  perform test.assert_equals('activated_challenge_timezone', v_challenge.timezone, 'Europe/Stockholm');
  perform test.assert_equals('activation_snapshot_goal', v_challenge.activation_snapshot ->> 'goal', 'Feel stronger');
  perform test.assert_equals('activation_snapshot_membership_status',
    v_challenge.activation_snapshot ->> 'membershipStatusAtActivation', 'trialing');
  perform test.assert_equals('activation_snapshot_recipient_count',
    jsonb_array_length(v_challenge.activation_snapshot -> 'recipients'), 1);

  select count(*) into v_period_count from public.challenge_periods where challenge_id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('activated_challenge_period_count', v_period_count, 14::bigint);

  select min(reporting_closes_at - ends_at) into v_gap from public.challenge_periods where challenge_id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('reporting_window_is_24_hours', v_gap, interval '24:00:00');
end;
$$;
reset role;

-- Idempotent: calling activate_challenge_draft again for the now-active
-- challenge returns the same result instead of erroring or re-activating
-- (re-running the whole trusted transaction, including
-- generate_challenge_periods, would otherwise raise a conflicting-repeat
-- error against the already-populated ledger).
set role authenticated;
select set_config('request.jwt.claim.sub', '61111111-0000-0000-0000-000000000001', false);
select test.assert_equals(
  'repeated_activation_is_idempotent',
  (public.activate_challenge_draft('63333333-0000-0000-0000-000000000001', 'Europe/Stockholm') ->> 'status'),
  'active'
);
reset role;
set role service_role;
do $$
declare
  v_period_count bigint;
begin
  select count(*) into v_period_count from public.challenge_periods where challenge_id = '63333333-0000-0000-0000-000000000001';
  perform test.assert_equals('repeated_activation_creates_no_duplicate_periods', v_period_count, 14::bigint);
end;
$$;
reset role;

-- A different authenticated user cannot activate Owner A's challenge --
-- identical rejection to "not found".
set role authenticated;
select set_config('request.jwt.claim.sub', '61111111-0000-0000-0000-000000000002', false);
select test.assert_fails(
  'non_owner_cannot_activate',
  $stmt$select public.activate_challenge_draft('63333333-0000-0000-0000-000000000001', 'Europe/Stockholm')$stmt$,
  'P0002'
);
reset role;

-- An unauthenticated call is rejected outright.
set role anon;
select test.assert_fails(
  'anon_cannot_call_activate_challenge_draft',
  $stmt$select public.activate_challenge_draft('63333333-0000-0000-0000-000000000001', 'Europe/Stockholm')$stmt$,
  '42501'
);
reset role;
