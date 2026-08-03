-- Anonymous users must not be able to read or write any protected row.
-- Every statement is machine-asserted: a SELECT that unexpectedly succeeds,
-- or fails with the wrong SQLSTATE, fails this file (and the whole suite).
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select test.assert_fails('anon_select_profiles_denied', 'select count(*) from public.profiles', '42501');
select test.assert_fails('anon_select_challenge_drafts_denied', 'select count(*) from public.challenge_drafts', '42501');
select test.assert_fails('anon_select_challenges_denied', 'select count(*) from public.challenges', '42501');
select test.assert_fails('anon_select_challenge_recipients_denied', 'select count(*) from public.challenge_recipients', '42501');
select test.assert_fails('anon_select_challenge_periods_denied', 'select count(*) from public.challenge_periods', '42501');
select test.assert_fails('anon_select_check_in_events_denied', 'select count(*) from public.check_in_events', '42501');
select test.assert_fails('anon_select_consequences_denied', 'select count(*) from public.consequences', '42501');
select test.assert_fails('anon_select_invitations_denied', 'select count(*) from public.invitations', '42501');
select test.assert_fails('anon_select_memberships_denied', 'select count(*) from public.memberships', '42501');

select test.assert_fails(
  'anon_insert_profile_denied',
  $stmt$insert into public.profiles (id, display_name) values ('11111111-1111-1111-1111-111111111111', 'x')$stmt$,
  '42501'
);
