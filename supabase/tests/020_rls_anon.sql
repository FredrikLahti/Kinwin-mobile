-- Anonymous users must not be able to read or write any protected row.
-- Every SELECT below is expected to return 0 rows (RLS silently filters);
-- every write is expected to fail with a permission error.
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select 'anon_select_profiles' as test, count(*) as rows_seen from public.profiles;
select 'anon_select_challenge_drafts' as test, count(*) as rows_seen from public.challenge_drafts;
select 'anon_select_challenges' as test, count(*) as rows_seen from public.challenges;
select 'anon_select_challenge_recipients' as test, count(*) as rows_seen from public.challenge_recipients;
select 'anon_select_challenge_periods' as test, count(*) as rows_seen from public.challenge_periods;
select 'anon_select_check_in_events' as test, count(*) as rows_seen from public.check_in_events;
select 'anon_select_consequences' as test, count(*) as rows_seen from public.consequences;
select 'anon_select_invitations' as test, count(*) as rows_seen from public.invitations;
select 'anon_select_memberships' as test, count(*) as rows_seen from public.memberships;

-- Expected: ERROR permission denied for schema/table (no grant at all to anon).
insert into public.profiles (id, display_name) values ('11111111-1111-1111-1111-111111111111', 'x');
