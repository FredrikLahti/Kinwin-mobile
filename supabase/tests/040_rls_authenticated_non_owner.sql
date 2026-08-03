-- Owner B (2222...2222), authenticated, must not see or touch Owner A's rows,
-- but does see (only) their own empty result set and can manage their own profile.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

-- Expected: 0 rows everywhere Owner A has data, since RLS filters by owner_id/auth.uid().
select 'non_owner_sees_profiles' as test, count(*) as rows_seen from public.profiles;
select 'non_owner_sees_drafts' as test, count(*) as rows_seen from public.challenge_drafts;
select 'non_owner_sees_challenges' as test, count(*) as rows_seen from public.challenges;
select 'non_owner_sees_recipients' as test, count(*) as rows_seen from public.challenge_recipients;
select 'non_owner_sees_periods' as test, count(*) as rows_seen from public.challenge_periods;
select 'non_owner_sees_checkins' as test, count(*) as rows_seen from public.check_in_events;
select 'non_owner_sees_consequences' as test, count(*) as rows_seen from public.consequences;
select 'non_owner_sees_invitations' as test, count(*) as rows_seen from public.invitations;
select 'non_owner_sees_membership' as test, count(*) as rows_seen from public.memberships;

-- Expected: 0 rows affected (RLS with-check silently filters, not an error) —
-- a non-owner cannot repoint someone else's draft to themselves either.
update public.challenge_drafts set draft_status = 'archived' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'non_owner_update_others_draft_rowcount' as test, (select count(*) from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000001' and draft_status = 'archived') as archived_by_other;

-- Owner B can still manage their own profile normally.
insert into public.profiles (id, display_name) values ('22222222-2222-2222-2222-222222222222', 'Owner B') on conflict (id) do update set display_name = excluded.display_name;
select 'non_owner_manages_own_profile' as test, display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222';
