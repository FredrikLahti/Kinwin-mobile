-- Exercises social_activity + activity_reactions RLS
-- (20260815000000_social_activity.sql), the challenge_started trigger, and
-- the trusted finalize_challenge_result RPC
-- (20260816000000_finalize_challenge_result.sql). D and E are accepted Kin;
-- F is a stranger who must never read or write anything on D's activity.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
declare
  v_connection_id uuid;
begin
  insert into auth.users (id, email) values
    ('94111111-0000-0000-0000-000000000001', 'social-d@example.test'),
    ('94111111-0000-0000-0000-000000000002', 'social-e@example.test'),
    ('94111111-0000-0000-0000-000000000003', 'social-f@example.test');

  insert into public.kin_connections (id, requester_id, recipient_id, status)
    values (gen_random_uuid(), '94111111-0000-0000-0000-000000000001', '94111111-0000-0000-0000-000000000002', 'accepted')
    returning id into v_connection_id;

  -- A pending_activation challenge for D, activated by a direct status
  -- update (this file only needs the trigger + a real activation_snapshot,
  -- not a re-proof of activate_challenge_draft's own payment gate --
  -- already covered by 150_full_activation.sql).
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    '92222222-0000-0000-0000-000000000001', '94111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', '92222222-0000-0000-0000-000000000001', 'ownerId', '94111111-0000-0000-0000-000000000001',
      'goal', 'Sleep better', 'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build')),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(), 'rewardOrganizer', null, 'experienceCategory', null,
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', false,
      'invitationMessage', '', 'membershipSelection', null
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('93333333-0000-0000-0000-000000000001', '94111111-0000-0000-0000-000000000001', '92222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), '93333333-0000-0000-0000-000000000001', '94111111-0000-0000-0000-000000000001', 'authorized', 5000, 'USD', 'authorized', now());

  update public.challenges set
    challenge_status = 'active', timezone = 'Europe/Stockholm', activated_at = now(),
    starts_at = now(), planned_ends_at = now() + interval '28 days',
    activation_snapshot = jsonb_build_object(
      'id', '93333333-0000-0000-0000-000000000001', 'ownerId', '94111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Sleep better',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
    where id = '93333333-0000-0000-0000-000000000001';
end;
$$;
reset role;

-- The activation trigger generated exactly one challenge_started row.
select test.assert_equals('activation_trigger_creates_started_activity',
  (select count(*) from public.social_activity where challenge_id = '93333333-0000-0000-0000-000000000001' and kind = 'challenge_started'),
  1::bigint);
do $$
declare
  v_payload jsonb;
begin
  select payload into v_payload from public.social_activity where challenge_id = '93333333-0000-0000-0000-000000000001' and kind = 'challenge_started';
  perform test.assert_equals('started_activity_payload_carries_behavior_only',
    v_payload, jsonb_build_object('behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session')));
end;
$$;

-- A second no-op update (status already 'active') must not create a
-- duplicate -- the trigger's own `old.challenge_status is distinct from
-- 'active'` guard, backed by the dedupe_key unique constraint either way.
set role service_role;
update public.challenges set updated_at = now() where id = '93333333-0000-0000-0000-000000000001';
select test.assert_equals('reactivation_style_update_creates_no_duplicate_started_activity',
  (select count(*) from public.social_activity where challenge_id = '93333333-0000-0000-0000-000000000001' and kind = 'challenge_started'),
  1::bigint);
reset role;

-- D (owner) sees their own activity; E (accepted Kin) also sees it; F
-- (stranger) sees none of it.
set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000001', false);
select test.assert_equals('owner_sees_own_activity',
  (select count(*) from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001'), 1::bigint);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000002', false);
select test.assert_equals('accepted_kin_sees_owner_activity',
  (select count(*) from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001'), 1::bigint);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_cannot_see_activity',
  (select count(*) from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- Nobody may write social_activity directly -- always server-asserted.
set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000001', false);
select test.assert_fails('authenticated_cannot_insert_social_activity_directly',
  $stmt$insert into public.social_activity (owner_id, challenge_id, kind, payload, dedupe_key)
    values ('94111111-0000-0000-0000-000000000001', '93333333-0000-0000-0000-000000000001', 'challenge_started', jsonb_build_object('x', 1), 'fake:1')$stmt$,
  '42501');
reset role;

-- Reactions: E (accepted Kin, can see the activity) may react as
-- themselves; F (stranger) cannot see or react at all.
set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_activity_id uuid;
  v_affected bigint;
begin
  select id into v_activity_id from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001' and kind = 'challenge_started';
  insert into public.activity_reactions (activity_id, user_id, kind) values (v_activity_id, '94111111-0000-0000-0000-000000000002', 'respect');
  get diagnostics v_affected = row_count;
  perform test.assert_equals('accepted_kin_can_react', v_affected, 1::bigint);
end;
$$;
-- Reacting again with a different kind is a distinct attempt but the same
-- (activity_id, user_id) pair -- must be rejected, not silently duplicated;
-- a real "change my reaction" flow deletes-then-inserts, which is exercised
-- separately below.
select test.assert_fails('one_reaction_per_user_per_activity',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    select id, '94111111-0000-0000-0000-000000000002', 'brutal' from public.social_activity
    where owner_id = '94111111-0000-0000-0000-000000000001' and kind = 'challenge_started'$stmt$,
  '23505');
-- Cannot react as someone else.
select test.assert_fails('cannot_react_as_another_user',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    select id, '94111111-0000-0000-0000-000000000001', 'nice' from public.social_activity
    where owner_id = '94111111-0000-0000-0000-000000000001' and kind = 'challenge_started'$stmt$,
  '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000003', false);
do $$
declare
  v_activity_id uuid;
begin
  select id into v_activity_id from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001' and kind = 'challenge_started';
  perform test.assert_true('stranger_cannot_see_activity_id_to_react_to', v_activity_id is null);
end;
$$;
select test.assert_fails('stranger_cannot_react_to_unrelated_activity',
  format($stmt$insert into public.activity_reactions (activity_id, user_id, kind) values (%L::uuid, '94111111-0000-0000-0000-000000000003', 'ouch')$stmt$,
    (select id from public.social_activity where owner_id = '94111111-0000-0000-0000-000000000001' and kind = 'challenge_started')),
  '42501');
select test.assert_equals('stranger_reads_zero_reactions',
  (select count(*) from public.activity_reactions where user_id = '94111111-0000-0000-0000-000000000002'), 0::bigint);
reset role;

-- E may delete their own reaction; D (the activity owner, but not the
-- reactor) may not delete E's reaction.
set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000001', false);
do $$
declare
  v_affected bigint;
begin
  delete from public.activity_reactions where user_id = '94111111-0000-0000-0000-000000000002';
  get diagnostics v_affected = row_count;
  perform test.assert_equals('owner_cannot_delete_others_reaction', v_affected, 0::bigint);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_affected bigint;
begin
  delete from public.activity_reactions where user_id = '94111111-0000-0000-0000-000000000002';
  get diagnostics v_affected = row_count;
  perform test.assert_equals('own_reaction_can_be_deleted', v_affected, 1::bigint);
end;
$$;
reset role;

-- finalize_challenge_result: the trusted write behind finalize-challenge.
-- Only service_role may call it; success/failure both transition status and
-- write exactly one activity row, idempotently on a repeat call.
set role authenticated;
select set_config('request.jwt.claim.sub', '94111111-0000-0000-0000-000000000001', false);
select test.assert_fails('authenticated_cannot_call_finalize_challenge_result',
  $stmt$select public.finalize_challenge_result(
    '94111111-0000-0000-0000-000000000001', '93333333-0000-0000-0000-000000000001', 'completed_success',
    'challenge_succeeded', jsonb_build_object('behavior', jsonb_build_object('description', 'x')), 'succeeded:93333333-0000-0000-0000-000000000001')$stmt$,
  '42501');
reset role;

-- finalize_challenge_result now requires the challenge to already be
-- awaiting_resolution (20260820000000_challenge_completion_lifecycle.sql)
-- -- a direct status update stands in for a real reconciliation here,
-- same as this file already sets challenge_status = 'active' directly
-- above rather than going through activate_challenge_draft; reconciliation
-- itself is exercised separately in 230_challenge_completion_lifecycle.sql.
set role service_role;
update public.challenges set challenge_status = 'awaiting_resolution' where id = '93333333-0000-0000-0000-000000000001';
do $$
declare
  v_result jsonb;
  v_status text;
  v_count bigint;
begin
  select public.finalize_challenge_result(
    '94111111-0000-0000-0000-000000000001', '93333333-0000-0000-0000-000000000001', 'completed_success',
    'challenge_succeeded', jsonb_build_object('behavior', jsonb_build_object('description', 'Strength train')),
    'succeeded:93333333-0000-0000-0000-000000000001'
  ) into v_result;
  perform test.assert_equals('finalize_returns_completed_success', v_result ->> 'status', 'completed_success');
  perform test.assert_equals('finalize_reports_not_already_finalized', (v_result ->> 'alreadyFinalized')::boolean, false);

  select challenge_status into v_status from public.challenges where id = '93333333-0000-0000-0000-000000000001';
  perform test.assert_equals('finalize_persists_challenge_status', v_status, 'completed_success');

  select count(*) into v_count from public.social_activity
    where challenge_id = '93333333-0000-0000-0000-000000000001' and kind = 'challenge_succeeded';
  perform test.assert_equals('finalize_creates_exactly_one_succeeded_activity', v_count, 1::bigint);
end;
$$;

-- A repeat call (the client's opportunistic trigger firing twice, or a
-- retry) is idempotent: same reported status, no duplicate activity row.
do $$
declare
  v_result jsonb;
  v_count bigint;
begin
  select public.finalize_challenge_result(
    '94111111-0000-0000-0000-000000000001', '93333333-0000-0000-0000-000000000001', 'completed_success',
    'challenge_succeeded', jsonb_build_object('behavior', jsonb_build_object('description', 'Strength train')),
    'succeeded:93333333-0000-0000-0000-000000000001'
  ) into v_result;
  perform test.assert_equals('finalize_repeat_reports_already_finalized', (v_result ->> 'alreadyFinalized')::boolean, true);

  select count(*) into v_count from public.social_activity
    where challenge_id = '93333333-0000-0000-0000-000000000001' and kind = 'challenge_succeeded';
  perform test.assert_equals('finalize_repeat_creates_no_duplicate_activity', v_count, 1::bigint);
end;
$$;
reset role;
