-- Owner B (2222...2222), authenticated, must not see or touch Owner A's rows,
-- but does see (only) their own profile and can manage it normally.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

-- Owner B sees exactly their own single profile row (not Owner A's).
select test.assert_equals('non_owner_sees_only_own_profile', (select count(*) from public.profiles), 1::bigint);
do $$
declare
  seen_id uuid;
begin
  select id into seen_id from public.profiles limit 1;
  perform test.assert_equals('non_owner_profile_row_is_their_own', seen_id, '22222222-2222-2222-2222-222222222222'::uuid);
end;
$$;

-- Zero rows anywhere Owner A has data.
select test.assert_equals('non_owner_sees_no_drafts', (select count(*) from public.challenge_drafts), 0::bigint);
select test.assert_equals('non_owner_sees_no_challenges', (select count(*) from public.challenges), 0::bigint);
select test.assert_equals('non_owner_sees_no_recipients', (select count(*) from public.challenge_recipients), 0::bigint);
select test.assert_equals('non_owner_sees_no_periods', (select count(*) from public.challenge_periods), 0::bigint);
select test.assert_equals('non_owner_sees_no_checkins', (select count(*) from public.check_in_events), 0::bigint);
select test.assert_equals('non_owner_sees_no_consequences', (select count(*) from public.consequences), 0::bigint);
select test.assert_equals('non_owner_sees_no_invitations', (select count(*) from public.invitations), 0::bigint);
select test.assert_equals('non_owner_sees_no_membership', (select count(*) from public.memberships), 0::bigint);

-- A non-owner's UPDATE against someone else's draft succeeds as a statement
-- (RLS filters rows, it does not error) but must affect exactly zero rows,
-- and the target row must remain genuinely unchanged.
do $$
declare
  affected bigint;
  persisted text;
begin
  update public.challenge_drafts set draft_status = 'archived' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  perform test.assert_equals('non_owner_update_others_draft_rowcount', affected, 0::bigint);
end;
$$;

set role service_role;
do $$
declare
  persisted text;
begin
  select draft_status into persisted from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test.assert_true('others_draft_status_unchanged_by_non_owner', persisted is distinct from 'archived', format('draft_status is now %L', persisted));
end;
$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

-- Owner B can still manage their own profile normally. A plain UPDATE, not
-- an INSERT ... ON CONFLICT: the row already exists (created by the
-- signup trigger), and authenticated only has column-restricted INSERT
-- privilege on (id, display_name) -- an INSERT listing kin_code (even a
-- value that would never actually be persisted, since this always hits
-- the conflict branch) fails with a column-level permission error before
-- the conflict is ever resolved.
do $$
declare
  persisted text;
begin
  update public.profiles set display_name = 'Owner B' where id = '22222222-2222-2222-2222-222222222222';
  select display_name into persisted from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  perform test.assert_equals('non_owner_manages_own_profile', persisted, 'Owner B');
end;
$$;
