-- Owner (Owner A, 1111...1111) acting as `authenticated`.
-- Expected: full read/write of own profile and drafts; read-only for
-- activated/runtime records; no write path exists for those at all.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Reads: owner sees exactly their own rows.
select 'owner_sees_own_profile' as test, count(*) as rows_seen from public.profiles;
select 'owner_sees_own_draft' as test, count(*) as rows_seen from public.challenge_drafts;
select 'owner_sees_own_challenge' as test, count(*) as rows_seen from public.challenges;
select 'owner_sees_own_recipients' as test, count(*) as rows_seen from public.challenge_recipients;
select 'owner_sees_own_periods' as test, count(*) as rows_seen from public.challenge_periods;
select 'owner_sees_own_checkins' as test, count(*) as rows_seen from public.check_in_events;
select 'owner_sees_own_consequences' as test, count(*) as rows_seen from public.consequences;
select 'owner_sees_own_invitations' as test, count(*) as rows_seen from public.invitations;
select 'owner_sees_own_membership' as test, count(*) as rows_seen from public.memberships;

-- Write: owner can update their own draft (allowed columns only).
update public.challenge_drafts set draft_status = 'ready_for_activation' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'owner_updated_own_draft' as test, draft_status from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Write: owner can update their own profile display_name.
update public.profiles set display_name = 'Owner A Renamed' where id = '11111111-1111-1111-1111-111111111111';
select 'owner_updated_own_profile' as test, display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111';

-- Expected failures: no grant exists for writing activated/runtime tables at all.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation');

update public.challenges set challenge_status = 'completed_success' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'build_completion', jsonb_build_object('behaviorCompleted', true), 'ios', now());

update public.check_in_events set event_payload = jsonb_build_object('behaviorCompleted', false) where id = 'eeeeeeee-0000-0000-0000-000000000001';

delete from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001';

insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'draft', 100, 'USD');

update public.memberships set membership_status = 'active' where owner_id = '11111111-1111-1111-1111-111111111111';
