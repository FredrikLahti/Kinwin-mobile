-- Exercises the protect_activated_challenge_snapshot trigger and the
-- append-only nature of check_in_events, acting as the trusted service_role
-- (which has table-level write grants; RLS is bypassed by the role's
-- bypassrls attribute, matching Supabase's own service_role convention).
set role service_role;

-- Expected: rejected. activation_snapshot is protected once a challenge is active.
update public.challenges
  set activation_snapshot = activation_snapshot || jsonb_build_object('goal', 'Tampered goal')
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Expected: rejected. starts_at is a protected commitment field.
update public.challenges set starts_at = starts_at + interval '10 days' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Expected: rejected. timezone is a protected commitment field.
update public.challenges set timezone = 'UTC' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Expected: allowed. challenge_status is an intentionally mutable lifecycle field.
update public.challenges set challenge_status = 'completion_mode' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select 'trusted_lifecycle_status_change' as test, challenge_status from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Expected: allowed. completed_at is a mutable operational column, paired with a terminal status.
update public.challenges set challenge_status = 'completed_failure', completed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select 'trusted_completed_at_change' as test, challenge_status, completed_at is not null as has_completed_at from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Confirm the earlier rejected updates truly left the protected fields untouched.
select 'snapshot_goal_unchanged' as test, activation_snapshot ->> 'goal' as goal from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select 'timezone_unchanged' as test, timezone from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Correction event: a correction pointing at another challenge's event must be rejected by the FK.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values ('99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation');
insert into public.check_in_events (id, challenge_id, owner_id, event_type, event_payload, source, client_recorded_at, correction_of_event_id)
  values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'correction', jsonb_build_object('note', 'oops'), 'server', now(), 'eeeeeeee-0000-0000-0000-000000000001');

-- A correction within the SAME challenge succeeds (event still exists at this point).
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at, correction_of_event_id)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'correction', jsonb_build_object('note', 'fixed'), 'server', now(), 'eeeeeeee-0000-0000-0000-000000000001');
select 'same_challenge_correction_succeeds' as test, count(*) as rows_seen from public.check_in_events where event_type = 'correction';

-- Older Cut back totals are preserved (append semantics): insert two totals for a new cut-back-style challenge/period and confirm both remain queryable.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values ('88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation');
insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
  values ('77777777-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000008', 1, 'day', now(), now() + interval '1 day', jsonb_build_object('type', 'maximum_value', 'maximum', 3));
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values ('66666666-0000-0000-0000-000000000006', '88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '77777777-0000-0000-0000-000000000007', 'cut_back_total', jsonb_build_object('currentTotal', 2, 'unit', 'times'), 'ios', now());
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values (gen_random_uuid(), '88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '77777777-0000-0000-0000-000000000007', 'cut_back_total', jsonb_build_object('currentTotal', 5, 'unit', 'times'), 'ios', now());
select 'older_cut_back_total_preserved' as test, count(*) as rows_seen from public.check_in_events where challenge_id = '88888888-0000-0000-0000-000000000008' and event_type = 'cut_back_total';
select 'older_total_value_intact' as test, event_payload ->> 'currentTotal' as first_total from public.check_in_events where id = '66666666-0000-0000-0000-000000000006';

-- check_in_events: append-only for every role, including the trusted service_role.
-- Both must now be rejected by the reject_check_in_event_mutation trigger.
update public.check_in_events set event_payload = jsonb_build_object('behaviorCompleted', false) where id = 'eeeeeeee-0000-0000-0000-000000000001';
delete from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- Confirm the original event is genuinely untouched after the rejected attempts above.
select 'original_event_survives' as test, event_payload ->> 'behaviorCompleted' as behavior_completed from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001';
