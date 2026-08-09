-- Exercises the Kin connection state machine
-- (20260814000000_kin_connections.sql): redeem_kin_code, accept/decline/
-- cancel_kin_request, remove_kin, block_kin, and kin_connections' own RLS.
-- Three fresh users: A and B become Kin; C is a stranger who must never see
-- or touch the A/B connection.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('81111111-0000-0000-0000-000000000001', 'kin-a@example.test'),
    ('81111111-0000-0000-0000-000000000002', 'kin-b@example.test'),
    ('81111111-0000-0000-0000-000000000003', 'kin-c@example.test');
  -- The on_auth_user_created trigger already gave each a kin_code; fix them
  -- to known values so this file can redeem by code deterministically.
  update public.profiles set kin_code = 'AAAAAAAA' where id = '81111111-0000-0000-0000-000000000001';
  update public.profiles set kin_code = 'BBBBBBBB' where id = '81111111-0000-0000-0000-000000000002';
  update public.profiles set kin_code = 'CCCCCCCC' where id = '81111111-0000-0000-0000-000000000003';
end;
$$;
reset role;

-- Every new profile gets a real kin_code from signup, not just users created
-- explicitly for this file.
select test.assert_true('signup_trigger_assigns_kin_code',
  (select kin_code is not null and length(kin_code) = 8 from public.profiles where id = '11111111-1111-1111-1111-111111111111'));

-- B redeems A's code: creates a pending request with B as requester.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_result jsonb;
  v_row public.kin_connections%rowtype;
begin
  select public.redeem_kin_code('AAAAAAAA') into v_result;
  perform test.assert_equals('redeem_creates_pending', v_result ->> 'status', 'requested');

  select * into v_row from public.kin_connections where id = (v_result ->> 'connectionId')::uuid;
  perform test.assert_equals('redeem_requester_is_caller', v_row.requester_id, '81111111-0000-0000-0000-000000000002'::uuid);
  perform test.assert_equals('redeem_recipient_is_code_owner', v_row.recipient_id, '81111111-0000-0000-0000-000000000001'::uuid);
  perform test.assert_equals('redeem_status_pending', v_row.status, 'pending');
end;
$$;

-- Redeeming again while already pending is a safe no-op, not a duplicate row.
do $$
declare
  v_result jsonb;
  v_count bigint;
begin
  select public.redeem_kin_code('aaaaaaaa') into v_result; -- lower-case: code lookup is case-insensitive via upper()
  perform test.assert_equals('redeem_again_reports_already_pending', v_result ->> 'status', 'already_pending');
  select count(*) into v_count from public.kin_connections
    where least(requester_id, recipient_id) = least('81111111-0000-0000-0000-000000000001'::uuid, '81111111-0000-0000-0000-000000000002'::uuid)
      and greatest(requester_id, recipient_id) = greatest('81111111-0000-0000-0000-000000000001'::uuid, '81111111-0000-0000-0000-000000000002'::uuid);
  perform test.assert_equals('redeem_again_creates_no_second_row', v_count, 1::bigint);
end;
$$;

select test.assert_fails('redeem_self_denied', $stmt$select public.redeem_kin_code('BBBBBBBB')$stmt$, '22023');
select test.assert_fails('redeem_unknown_code_denied', $stmt$select public.redeem_kin_code('ZZZZZZZZ')$stmt$, 'P0002');
reset role;

-- The new profiles_select_kin policy: B (requester on a pending request) can
-- now read A's display_name; a stranger (C, no connection to A at all)
-- still cannot see A's profile beyond their own.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
select test.assert_equals('pending_requester_can_read_recipient_profile',
  (select count(*) from public.profiles where id = '81111111-0000-0000-0000-000000000001'), 1::bigint);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_cannot_read_unconnected_profile',
  (select count(*) from public.profiles where id = '81111111-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- The requester (B) can see the pending request; a stranger (C) cannot.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
select test.assert_equals('requester_sees_own_pending_request',
  (select count(*) from public.kin_connections where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001'),
  1::bigint);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_cannot_see_others_pending_request',
  (select count(*) from public.kin_connections where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001'),
  0::bigint);
reset role;

-- Only the recipient (A) may accept; the requester (B) cannot accept their
-- own outgoing request, and a stranger (C) gets the same not-found result a
-- real unauthorized caller would (never a distinguishing error).
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  perform test.assert_fails('requester_cannot_accept_own_request',
    format($stmt$select public.accept_kin_request(%L::uuid)$stmt$, v_connection_id), 'P0002');
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000003', false);
do $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  -- C cannot even see the row (RLS), so v_connection_id is null here -- a
  -- realistic caller would have to guess a real id blind; assert that too.
  perform test.assert_true('stranger_cannot_read_pending_id_via_rls', v_connection_id is null);
end;
$$;
select test.assert_fails('stranger_cannot_accept_unrelated_request',
  format($stmt$select public.accept_kin_request(%L::uuid)$stmt$, gen_random_uuid()), 'P0002');
reset role;

-- A (the real recipient) accepts: both become Kin.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000001', false);
do $$
declare
  v_connection_id uuid;
  v_result jsonb;
  v_status text;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  select public.accept_kin_request(v_connection_id) into v_result;
  perform test.assert_equals('recipient_accepts_request', v_result ->> 'status', 'accepted');

  select status into v_status from public.kin_connections where id = v_connection_id;
  perform test.assert_equals('connection_status_is_accepted', v_status, 'accepted');
end;
$$;
-- Accepting an already-accepted request again is idempotent, not an error.
do $$
declare
  v_connection_id uuid;
  v_result jsonb;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  select public.accept_kin_request(v_connection_id) into v_result;
  perform test.assert_equals('accept_again_is_idempotent', v_result ->> 'status', 'accepted');
end;
$$;
reset role;

-- Only a real participant may remove the connection; a stranger cannot.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000003', false);
do $$
declare
  v_connection_id uuid;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  perform test.assert_true('stranger_cannot_see_accepted_connection_id', v_connection_id is null);
end;
$$;
select test.assert_fails('stranger_cannot_remove_unrelated_connection',
  format($stmt$select public.remove_kin(%L::uuid)$stmt$, gen_random_uuid()), 'P0002');
reset role;

-- B removes the connection (soft removal, either party may act).
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_connection_id uuid;
  v_result jsonb;
  v_status text;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  select public.remove_kin(v_connection_id) into v_result;
  perform test.assert_equals('remove_kin_succeeds', v_result ->> 'status', 'removed');

  select status into v_status from public.kin_connections where id = v_connection_id;
  perform test.assert_equals('connection_status_is_removed', v_status, 'removed');
end;
$$;

-- After removal, either side may send a fresh request -- reuses the same
-- row rather than creating a duplicate.
do $$
declare
  v_result jsonb;
  v_row public.kin_connections%rowtype;
  v_count bigint;
begin
  select public.redeem_kin_code('AAAAAAAA') into v_result;
  perform test.assert_equals('redeem_after_removal_creates_fresh_request', v_result ->> 'status', 'requested');

  select * into v_row from public.kin_connections where id = (v_result ->> 'connectionId')::uuid;
  perform test.assert_equals('redeem_after_removal_status_pending', v_row.status, 'pending');

  select count(*) into v_count from public.kin_connections
    where least(requester_id, recipient_id) = least('81111111-0000-0000-0000-000000000001'::uuid, '81111111-0000-0000-0000-000000000002'::uuid)
      and greatest(requester_id, recipient_id) = greatest('81111111-0000-0000-0000-000000000001'::uuid, '81111111-0000-0000-0000-000000000002'::uuid);
  perform test.assert_equals('redeem_after_removal_reuses_row_not_duplicates', v_count, 1::bigint);
end;
$$;
reset role;

-- A declines this second request; declining deletes the row (not a status),
-- and B may then redeem again cleanly.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000001', false);
do $$
declare
  v_connection_id uuid;
  v_result jsonb;
  v_count bigint;
begin
  select id into v_connection_id from public.kin_connections
    where requester_id = '81111111-0000-0000-0000-000000000002' and recipient_id = '81111111-0000-0000-0000-000000000001';
  select public.decline_kin_request(v_connection_id) into v_result;
  perform test.assert_equals('decline_kin_request_succeeds', v_result ->> 'status', 'declined');

  select count(*) into v_count from public.kin_connections where id = v_connection_id;
  perform test.assert_equals('decline_deletes_the_row', v_count, 0::bigint);
end;
$$;
reset role;

-- B blocks C outright (no prior connection row exists yet). C can then never
-- successfully redeem B's code -- the whole point of block over remove.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_result jsonb;
  v_status text;
begin
  select public.block_kin('81111111-0000-0000-0000-000000000003') into v_result;
  perform test.assert_equals('block_kin_succeeds_with_no_prior_row', v_result ->> 'status', 'blocked');

  select status into v_status from public.kin_connections
    where least(requester_id, recipient_id) = least('81111111-0000-0000-0000-000000000002'::uuid, '81111111-0000-0000-0000-000000000003'::uuid)
      and greatest(requester_id, recipient_id) = greatest('81111111-0000-0000-0000-000000000002'::uuid, '81111111-0000-0000-0000-000000000003'::uuid);
  perform test.assert_equals('block_kin_status_is_blocked', v_status, 'blocked');
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000003', false);
select test.assert_fails('blocked_user_cannot_redeem_blockers_code', $stmt$select public.redeem_kin_code('BBBBBBBB')$stmt$, '22023');
reset role;

-- Nobody may write kin_connections directly -- every mutation goes through
-- the RPCs above, never a raw insert/update/delete.
set role authenticated;
select set_config('request.jwt.claim.sub', '81111111-0000-0000-0000-000000000001', false);
select test.assert_fails('authenticated_cannot_insert_kin_connections_directly',
  $stmt$insert into public.kin_connections (requester_id, recipient_id, status)
    values ('81111111-0000-0000-0000-000000000001', '81111111-0000-0000-0000-000000000003', 'pending')$stmt$,
  '42501');
reset role;

set role anon;
select test.assert_fails('anon_cannot_call_redeem_kin_code', $stmt$select public.redeem_kin_code('AAAAAAAA')$stmt$, '42501');
reset role;
