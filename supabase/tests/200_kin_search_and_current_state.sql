-- Exercises search_kin_candidates, send_kin_request, and
-- get_kin_current_challenges (20260817000000_kin_search_and_current_state.sql).
-- X has a challenge that was already active BEFORE X and Y become Kin --
-- the exact physical-test scenario that motivated this migration. Z is a
-- stranger throughout.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('a1111111-0000-0000-0000-000000000001', 'search-x@example.test'),
    ('a1111111-0000-0000-0000-000000000002', 'search-y@example.test'),
    ('a1111111-0000-0000-0000-000000000003', 'search-z@example.test'),
    ('a1111111-0000-0000-0000-000000000004', 'anna-smith@example.test'),
    ('a1111111-0000-0000-0000-000000000005', 'anna-jones@example.test');

  update public.profiles set display_name = 'Searchable X' where id = 'a1111111-0000-0000-0000-000000000001';
  update public.profiles set display_name = 'Searchable Y' where id = 'a1111111-0000-0000-0000-000000000002';
  update public.profiles set display_name = 'Searchable Z' where id = 'a1111111-0000-0000-0000-000000000003';
  update public.profiles set display_name = 'Anna Smith' where id = 'a1111111-0000-0000-0000-000000000004';
  update public.profiles set display_name = 'Anna Jones' where id = 'a1111111-0000-0000-0000-000000000005';

  -- X's challenge, already active -- created and activated here, entirely
  -- before any kin_connections row involving X exists.
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'a2222222-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', 'a2222222-0000-0000-0000-000000000001', 'ownerId', 'a1111111-0000-0000-0000-000000000001',
      'goal', 'Eat well', 'behavior', jsonb_build_object('description', 'No unhealthy food', 'completionDefinition', 'No unhealthy food', 'rule', jsonb_build_object('direction', 'stop')),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1),
      'recipients', jsonb_build_array(), 'rewardOrganizer', null, 'experienceCategory', null,
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', false,
      'invitationMessage', '', 'membershipSelection', null
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('a3333333-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'a2222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), 'a3333333-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'authorized', 5000, 'USD', 'authorized', now());
  update public.challenges set
    challenge_status = 'active', timezone = 'Europe/Stockholm', activated_at = now(),
    starts_at = now(), planned_ends_at = now() + interval '28 days',
    activation_snapshot = jsonb_build_object(
      'id', 'a3333333-0000-0000-0000-000000000001', 'ownerId', 'a1111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Eat well',
      'behavior', jsonb_build_object('description', 'No unhealthy food', 'completionDefinition', 'No unhealthy food'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
    where id = 'a3333333-0000-0000-0000-000000000001';

  -- A second, already-COMPLETED challenge for X -- proves
  -- get_kin_current_challenges never surfaces historical challenges, only
  -- the current active one.
  insert into public.challenges (
    id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, completed_at, activation_snapshot
  ) values (
    'a3333333-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000001', null, 1, 1, 'completed_success',
    'Europe/Stockholm', now() - interval '60 days', now() - interval '60 days', now() - interval '30 days', now() - interval '30 days',
    jsonb_build_object(
      'id', 'a3333333-0000-0000-0000-000000000002', 'ownerId', 'a1111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Old goal',
      'behavior', jsonb_build_object('description', 'Old behavior', 'completionDefinition', 'Old behavior'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Dad')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Dad'), 'consequenceCategory', 'dinner',
      'stake', jsonb_build_object('minorUnits', 3000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
  );
end;
$$;
reset role;

-- ==== search_kin_candidates ====

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', false);

select test.assert_equals('search_exact_email_finds_the_account',
  (select count(*) from public.search_kin_candidates('search-x@example.test')), 1::bigint);
do $$
declare v_id uuid;
begin
  select id into v_id from public.search_kin_candidates('search-x@example.test');
  perform test.assert_equals('search_exact_email_returns_correct_id', v_id, 'a1111111-0000-0000-0000-000000000001'::uuid);
end;
$$;

select test.assert_equals('search_wrong_email_finds_nothing',
  (select count(*) from public.search_kin_candidates('nobody-at-all@example.test')), 0::bigint);

-- A truncated/partial email must never match -- proves no partial-email
-- enumeration is possible even though it is shaped like a (broken) email.
select test.assert_equals('search_partial_email_finds_nothing',
  (select count(*) from public.search_kin_candidates('search-x@example')), 0::bigint);

-- Bare local-part with no @ falls through to NAME search, where it will
-- not match a display_name and so also finds nothing -- still proves no
-- email data leaks through the name-search path either.
select test.assert_equals('search_email_local_part_alone_finds_nothing_via_name_search',
  (select count(*) from public.search_kin_candidates('search-x')), 0::bigint);

select test.assert_equals('search_name_prefix_finds_the_account',
  (select count(*) from public.search_kin_candidates('Searchable X')), 1::bigint);

select test.assert_equals('search_short_query_returns_nothing_not_an_error',
  (select count(*) from public.search_kin_candidates('a')), 0::bigint);

-- Duplicate display names: both accounts are returned, no crash.
select test.assert_equals('search_duplicate_names_returns_both_without_crashing',
  (select count(*) from public.search_kin_candidates('Anna')), 2::bigint);

select test.assert_equals('search_excludes_self',
  (select count(*) from public.search_kin_candidates('Searchable Y')), 0::bigint);

reset role;

-- ==== send_kin_request ====

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', false);
select test.assert_fails('send_kin_request_rejects_self',
  $stmt$select public.send_kin_request('a1111111-0000-0000-0000-000000000002')$stmt$, '22023');

do $$
declare
  v_result jsonb;
  v_row public.kin_connections%rowtype;
begin
  select public.send_kin_request('a1111111-0000-0000-0000-000000000001') into v_result;
  perform test.assert_equals('send_kin_request_creates_pending', v_result ->> 'status', 'requested');

  select * into v_row from public.kin_connections where id = (v_result ->> 'connectionId')::uuid;
  perform test.assert_equals('send_kin_request_requester_is_caller', v_row.requester_id, 'a1111111-0000-0000-0000-000000000002'::uuid);
  perform test.assert_equals('send_kin_request_recipient_is_target', v_row.recipient_id, 'a1111111-0000-0000-0000-000000000001'::uuid);
end;
$$;

-- search results now reflect the pending request in both directions.
select test.assert_equals('search_reflects_outgoing_pending',
  (select connection_status from public.search_kin_candidates('Searchable X')), 'pending');
select test.assert_equals('search_reflects_outgoing_direction',
  (select connection_direction from public.search_kin_candidates('Searchable X')), 'outgoing');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', false);
select test.assert_equals('search_reflects_incoming_direction',
  (select connection_direction from public.search_kin_candidates('Searchable Y')), 'incoming');
reset role;

-- ==== get_kin_current_challenges: the actual reported bug ====

-- Before Y and X are Kin at all, Y cannot see X's active challenge.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', false);
select test.assert_equals('non_kin_sees_no_current_challenge',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'a1111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- X accepts Y's earlier request -- becoming Kin AFTER the challenge was
-- already active, exactly like the physical-test scenario.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', false);
do $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = 'a1111111-0000-0000-0000-000000000002' and recipient_id = 'a1111111-0000-0000-0000-000000000001';
  perform public.accept_kin_request(v_connection_id);
end;
$$;
reset role;

-- Y immediately sees X's current active challenge -- no new event needed.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', false);
select test.assert_equals('newly_accepted_kin_sees_preexisting_active_challenge',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'a1111111-0000-0000-0000-000000000001'), 1::bigint);
do $$
declare
  v_challenge_id uuid;
  v_behavior jsonb;
begin
  select challenge_id, behavior into v_challenge_id, v_behavior from public.get_kin_current_challenges()
    where owner_id = 'a1111111-0000-0000-0000-000000000001';
  perform test.assert_equals('current_challenge_id_is_the_real_one', v_challenge_id, 'a3333333-0000-0000-0000-000000000001'::uuid);
  perform test.assert_equals('current_challenge_behavior_description', v_behavior ->> 'description', 'No unhealthy food');
end;
$$;

-- The old, already-completed challenge is never surfaced as "current".
select test.assert_equals('completed_challenge_never_appears_as_current',
  (select count(*) from public.get_kin_current_challenges() where challenge_id = 'a3333333-0000-0000-0000-000000000002'), 0::bigint);
reset role;

-- A stranger (Z, never connected to X) still sees nothing.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_sees_no_current_challenge',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'a1111111-0000-0000-0000-000000000001'), 0::bigint);
-- Directly querying challenges as a stranger doesn't error (RLS filters
-- rows, it doesn't raise) -- it just returns nothing, same conclusion via
-- the base table's own pre-existing owner-only policy.
select test.assert_equals('stranger_cannot_read_challenges_table_directly',
  (select count(*) from public.challenges where owner_id = 'a1111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- X's own call never returns their own challenge via this RPC -- it only
-- ever answers "what is my KIN doing", not a self-view.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', false);
select test.assert_equals('owner_does_not_see_own_challenge_via_kin_rpc',
  (select count(*) from public.get_kin_current_challenges()), 0::bigint);
reset role;

-- After Y removes the connection, the current-challenge visibility is
-- gone too -- proves this is a live authorization check, not a one-time
-- snapshot taken at accept time.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = 'a1111111-0000-0000-0000-000000000002' and recipient_id = 'a1111111-0000-0000-0000-000000000001';
  perform public.remove_kin(v_connection_id);
end;
$$;
select test.assert_equals('removed_kin_no_longer_sees_current_challenge',
  (select count(*) from public.get_kin_current_challenges() where owner_id = 'a1111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- ==== permissions ====

set role anon;
select test.assert_fails('anon_cannot_call_search_kin_candidates',
  $stmt$select public.search_kin_candidates('Searchable')$stmt$, '42501');
select test.assert_fails('anon_cannot_call_send_kin_request',
  $stmt$select public.send_kin_request('a1111111-0000-0000-0000-000000000001')$stmt$, '42501');
select test.assert_fails('anon_cannot_call_get_kin_current_challenges',
  $stmt$select public.get_kin_current_challenges()$stmt$, '42501');
reset role;
