-- Regression coverage for 20260818000000_canonical_current_challenge.sql:
-- reproduces the exact real-world state found on Fredrik's hosted account
-- (multiple stale rows left at challenge_status = 'active' -- a
-- pre-existing activation-lifecycle gap this migration works around, not
-- fixes) and proves get_kin_current_challenges now agrees with what Home
-- itself would show: only the single most-recently-activated row.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('b1111111-0000-0000-0000-000000000001', 'canonical-x@example.test'),
    ('b1111111-0000-0000-0000-000000000002', 'canonical-y@example.test'),
    ('b1111111-0000-0000-0000-000000000003', 'canonical-z@example.test');

  insert into public.kin_connections (id, requester_id, recipient_id, status)
    values (gen_random_uuid(), 'b1111111-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000002', 'accepted');

  -- Three stale 'active' rows for X, activated hours apart -- exactly the
  -- shape found on the real hosted account (nothing ever transitioned the
  -- earlier ones out of 'active' when a later one was activated).
  insert into public.challenges (
    id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
  ) values
    (
      'b3333333-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000001', null, 1, 1, 'active',
      'Europe/Stockholm', now() - interval '3 days', now() - interval '3 days', now() + interval '25 days',
      jsonb_build_object(
        'id', 'b3333333-0000-0000-0000-000000000001', 'ownerId', 'b1111111-0000-0000-0000-000000000001',
        'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Get stronger',
        'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Strength train'),
        'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
        'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
        'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'dinner',
        'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
        'membershipStatusAtActivation', 'trialing'
      )
    ),
    (
      'b3333333-0000-0000-0000-000000000002', 'b1111111-0000-0000-0000-000000000001', null, 1, 1, 'active',
      'Europe/Stockholm', now() - interval '2 days', now() - interval '2 days', now() + interval '26 days',
      jsonb_build_object(
        'id', 'b3333333-0000-0000-0000-000000000002', 'ownerId', 'b1111111-0000-0000-0000-000000000001',
        'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Less screen time',
        'behavior', jsonb_build_object('description', 'Time on social media', 'completionDefinition', 'Time on social media'),
        'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 1),
        'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Dad')),
        'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Dad'), 'consequenceCategory', 'dinner',
        'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
        'membershipStatusAtActivation', 'trialing'
      )
    ),
    (
      -- The genuinely current one -- most recently activated, and the
      -- only row Home itself resolves.
      'b3333333-0000-0000-0000-000000000003', 'b1111111-0000-0000-0000-000000000001', null, 1, 1, 'active',
      'Europe/Stockholm', now() - interval '1 hour', now() - interval '1 hour', now() + interval '27 days',
      jsonb_build_object(
        'id', 'b3333333-0000-0000-0000-000000000003', 'ownerId', 'b1111111-0000-0000-0000-000000000001',
        'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Eat well',
        'behavior', jsonb_build_object('description', 'No unhealthy food', 'completionDefinition', 'No unhealthy food'),
        'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1),
        'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
        'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
        'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
        'membershipStatusAtActivation', 'trialing'
      )
    );
end;
$$;
reset role;

-- Y (accepted Kin) sees exactly ONE current challenge for X -- not three.
set role authenticated;
select set_config('request.jwt.claim.sub', 'b1111111-0000-0000-0000-000000000002', false);
select test.assert_equals('accepted_kin_sees_exactly_one_current_challenge_not_every_stale_row',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'b1111111-0000-0000-0000-000000000001'), 1::bigint);

do $$
declare
  v_challenge_id uuid;
  v_behavior jsonb;
begin
  select challenge_id, behavior into v_challenge_id, v_behavior from public.get_kin_current_challenges()
    where owner_id = 'b1111111-0000-0000-0000-000000000001';
  perform test.assert_equals('canonical_current_challenge_is_the_most_recently_activated_one',
    v_challenge_id, 'b3333333-0000-0000-0000-000000000003'::uuid);
  perform test.assert_equals('canonical_current_challenge_behavior_matches_home',
    v_behavior ->> 'description', 'No unhealthy food');
end;
$$;

-- The two stale rows never appear, individually, as "current" to anyone.
select test.assert_equals('stale_active_row_one_never_appears_as_current',
  (select count(*) from public.get_kin_current_challenges() where challenge_id = 'b3333333-0000-0000-0000-000000000001'), 0::bigint);
select test.assert_equals('stale_active_row_two_never_appears_as_current',
  (select count(*) from public.get_kin_current_challenges() where challenge_id = 'b3333333-0000-0000-0000-000000000002'), 0::bigint);
reset role;

-- A stranger (Z, no connection to X) sees none of it, stale or canonical.
set role authenticated;
select set_config('request.jwt.claim.sub', 'b1111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_sees_no_current_challenge_regardless_of_stale_rows',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'b1111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;
