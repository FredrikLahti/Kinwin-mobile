-- Exercises the new one-active-challenge invariant
-- (20260819000000_challenge_lifecycle_integrity.sql): the
-- prepare_challenge_from_draft and activate_challenge_draft guards, the
-- decisive challenges_owner_one_active_idx unique index itself, that a
-- historical completed_success challenge never blocks a new one, and
-- that check-in correctly rejects a 'superseded' challenge while still
-- accepting the real active one.
--
-- Fixture sequencing is deliberate throughout: challenges_owner_one_pending_idx
-- (20260808000000) already allows at most ONE pending_activation row per
-- owner at any instant, same as challenges_owner_one_active_idx now does
-- for active/completion_mode -- so this file never has more than one
-- pending row and more than one active row for the same owner alive at
-- the same time, even mid-setup.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('c1111111-0000-0000-0000-000000000001', 'lifecycle-x@example.test'),
    ('c1111111-0000-0000-0000-000000000002', 'lifecycle-y@example.test');

  -- X: draft 1, ready to activate -- the only pending row for X until it
  -- is activated below.
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'c2222222-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', 'c2222222-0000-0000-0000-000000000001', 'ownerId', 'c1111111-0000-0000-0000-000000000001',
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
    values ('c3333333-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'c2222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), 'c3333333-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'authorized', 5000, 'USD', 'authorized', now());

  -- Y: a genuinely historical, completed challenge -- must never block Y
  -- from activating a fresh one.
  insert into public.challenges (
    id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, completed_at, activation_snapshot
  ) values (
    'c3333333-0000-0000-0000-000000000004', 'c1111111-0000-0000-0000-000000000002', null, 1, 1, 'completed_success',
    'Europe/Stockholm', now() - interval '60 days', now() - interval '60 days', now() - interval '30 days', now() - interval '30 days',
    jsonb_build_object(
      'id', 'c3333333-0000-0000-0000-000000000004', 'ownerId', 'c1111111-0000-0000-0000-000000000002',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Old goal',
      'behavior', jsonb_build_object('description', 'Old behavior', 'completionDefinition', 'Old behavior'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Dad')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Dad'), 'consequenceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 3000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
  );
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'c2222222-0000-0000-0000-000000000005', 'c1111111-0000-0000-0000-000000000002', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', 'c2222222-0000-0000-0000-000000000005', 'ownerId', 'c1111111-0000-0000-0000-000000000002',
      'goal', 'New goal', 'behavior', jsonb_build_object('description', 'New behavior', 'completionDefinition', 'New behavior', 'rule', jsonb_build_object('direction', 'stop', 'measurement', jsonb_build_object('type', 'abstinence', 'unit', 'lapse'), 'boundary', jsonb_build_object('periodUnit', 'challenge', 'maximumLapses', 0))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2), 'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1, 'lapseRule', jsonb_build_object('type', 'zero_lapses')),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')), 'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'wellness', 'stake', jsonb_build_object('minorUnits', 4000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'invitationMessage', 'Join me.', 'membershipSelection', 'monthly_trial'
    ),
    'ready_for_activation'
  );
end;
$$;
reset role;

-- X activates draft 1: succeeds, becomes the one real active challenge.
-- Zero pending rows remain for X once this commits.
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1111111-0000-0000-0000-000000000001', false);
select test.assert_equals('first_activation_succeeds',
  (public.activate_challenge_draft('c3333333-0000-0000-0000-000000000001', 'Europe/Stockholm') ->> 'status'), 'active');

-- Preparing a brand new draft while a real active challenge exists is
-- rejected -- prepare_challenge_from_draft's new guard. Isolated from
-- the "another pending exists" guard (already covered by
-- 120_one_pending_commitment_per_owner.sql): zero pending rows exist for
-- X at this point, so this can only be the new active-challenge check.
do $$
begin
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'c2222222-0000-0000-0000-000000000006', 'c1111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', 'c2222222-0000-0000-0000-000000000006', 'ownerId', 'c1111111-0000-0000-0000-000000000001',
      'goal', 'Another goal', 'behavior', jsonb_build_object('description', 'Something else', 'completionDefinition', 'Something else', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
      'duration', jsonb_build_object('unit', 'week', 'value', 2), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')), 'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
    ),
    'ready_for_activation'
  );
end;
$$;
select test.assert_fails('prepare_rejected_while_a_challenge_is_active',
  $stmt$select public.prepare_challenge_from_draft('c2222222-0000-0000-0000-000000000006')$stmt$,
  '22023');
reset role;

-- A second challenge for X, inserted directly (service_role) rather than
-- through prepare_challenge_from_draft -- safe now that zero pending rows
-- exist for X, and lets this file test activate_challenge_draft's own
-- guard in isolation, plus the DB-level invariant directly, without ever
-- having two pending or two active rows alive simultaneously. Carries a
-- full activation-shaped payload even while still 'pending_activation'
-- (allowed -- challenges_check2 only requires those fields for non-
-- pending/non-canceled statuses, never forbids them earlier) so it can
-- later become 'superseded' without a separate insert.
set role service_role;
insert into public.challenges (
  id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
  timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
) values (
  'c3333333-0000-0000-0000-000000000002', 'c1111111-0000-0000-0000-000000000001', null, 1, 1, 'pending_activation',
  'Europe/Stockholm', now(), now(), now() + interval '14 days',
  jsonb_build_object(
    'id', 'c3333333-0000-0000-0000-000000000002', 'ownerId', 'c1111111-0000-0000-0000-000000000001',
    'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Read more',
    'behavior', jsonb_build_object('description', 'Read before bed', 'completionDefinition', 'Read for 20 minutes'),
    'duration', jsonb_build_object('unit', 'week', 'value', 2), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'), 'consequenceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
    'membershipStatusAtActivation', 'trialing'
  )
);
reset role;

-- Activating this second (still pending) challenge while the first is
-- active is rejected -- activate_challenge_draft's own new guard.
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1111111-0000-0000-0000-000000000001', false);
select test.assert_fails('second_activation_rejected_while_first_active',
  $stmt$select public.activate_challenge_draft('c3333333-0000-0000-0000-000000000002', 'Europe/Stockholm')$stmt$,
  '22023');
do $$
declare
  v_status text;
begin
  select challenge_status into v_status from public.challenges where id = 'c3333333-0000-0000-0000-000000000002';
  perform test.assert_equals('rejected_second_activation_leaves_it_pending', v_status, 'pending_activation');
end;
$$;
reset role;

-- The decisive invariant: PostgreSQL itself, not application code,
-- refuses a second 'active' row for the same owner even via a direct
-- write that bypasses the RPCs entirely.
set role service_role;
select test.assert_fails('db_level_invariant_rejects_a_second_active_row_directly',
  $stmt$update public.challenges set challenge_status = 'active' where id = 'c3333333-0000-0000-0000-000000000002'$stmt$,
  '23505');
reset role;

-- Y (a different owner) has only a historical completed_success
-- challenge -- that must never block Y from preparing and activating a
-- genuinely new one.
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_result jsonb;
  v_challenge_id uuid;
begin
  select public.prepare_challenge_from_draft('c2222222-0000-0000-0000-000000000005') into v_result;
  perform test.assert_equals('historical_completed_challenge_does_not_block_prepare', v_result ->> 'status', 'pending_activation');
end;
$$;
reset role;
set role service_role;
update public.consequences set authorization_status = 'authorized', authorized_at = now()
  where challenge_id = (select id from public.challenges where source_draft_id = 'c2222222-0000-0000-0000-000000000005');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_challenge_id uuid;
  v_status text;
begin
  select id into v_challenge_id from public.challenges where source_draft_id = 'c2222222-0000-0000-0000-000000000005';
  select public.activate_challenge_draft(v_challenge_id, 'Europe/Stockholm') ->> 'status' into v_status;
  perform test.assert_equals('historical_completed_challenge_does_not_block_activation', v_status, 'active');
end;
$$;
reset role;

-- Check-in safety: the real active challenge still works; a challenge
-- marked 'superseded' (the real post-repair state -- see this migration's
-- own header) is correctly rejected, same as any other non-active status.
set role service_role;
do $$
declare
  v_period_id uuid;
  v_result jsonb;
begin
  select id into v_period_id from public.challenge_periods where challenge_id = 'c3333333-0000-0000-0000-000000000001' order by period_number limit 1;
  select public.append_check_in_event(
    'c1111111-0000-0000-0000-000000000001', 'c3333333-0000-0000-0000-000000000001', v_period_id,
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-lifecycle-1'
  ) into v_result;
  perform test.assert_true('check_in_succeeds_against_the_real_active_challenge', (v_result ->> 'eventId') is not null);

  -- Simulate the post-repair state directly on the second challenge
  -- (never actually activated in this file's own flow, since the
  -- invariant correctly refused that above -- this reproduces what the
  -- lifecycle migration's repair step did to Fredrik's historical rows).
  update public.challenges set challenge_status = 'superseded' where id = 'c3333333-0000-0000-0000-000000000002';
end;
$$;
select test.assert_fails('check_in_rejected_against_a_superseded_challenge',
  $stmt$select public.append_check_in_event(
    'c1111111-0000-0000-0000-000000000001', 'c3333333-0000-0000-0000-000000000002',
    (select id from public.challenge_periods where challenge_id = 'c3333333-0000-0000-0000-000000000002' limit 1),
    'build_completion', jsonb_build_object('kind', 'build_completion', 'completions', 1), 'ios', now(), 'op-lifecycle-2'
  )$stmt$,
  '22023');
reset role;
