-- Exercises the protect_activated_challenge_snapshot trigger and the
-- append-only nature of check_in_events, acting as the trusted service_role
-- (which has table-level write grants; RLS is bypassed by the role's
-- bypassrls attribute, matching Supabase's own service_role convention).
-- Both custom triggers raise with the explicit errcode '23000'
-- (integrity_constraint_violation) chosen in the migration, so assertions
-- check that exact SQLSTATE rather than accepting any arbitrary failure.
set role service_role;

select test.assert_fails(
  'activation_snapshot_edit_denied',
  $stmt$update public.challenges
    set activation_snapshot = activation_snapshot || jsonb_build_object('goal', 'Tampered goal')
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'$stmt$,
  '23000'
);
select test.assert_fails(
  'activation_starts_at_edit_denied',
  $stmt$update public.challenges set starts_at = starts_at + interval '10 days' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$stmt$,
  '23000'
);
select test.assert_fails(
  'activation_timezone_edit_denied',
  $stmt$update public.challenges set timezone = 'UTC' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$stmt$,
  '23000'
);

-- Mutable lifecycle fields remain writable by the trusted role.
do $$
declare
  affected bigint;
  persisted text;
begin
  update public.challenges set challenge_status = 'completion_mode' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  perform test.assert_equals('trusted_lifecycle_status_change_rowcount', affected, 1::bigint);
  select challenge_status into persisted from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  perform test.assert_equals('trusted_lifecycle_status_change_persisted', persisted, 'completion_mode');
end;
$$;

do $$
declare
  affected bigint;
  status_after text;
  has_completed_at boolean;
begin
  update public.challenges set challenge_status = 'completed_failure', completed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  perform test.assert_equals('trusted_completed_at_change_rowcount', affected, 1::bigint);
  select challenge_status, completed_at is not null into status_after, has_completed_at
    from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  perform test.assert_equals('trusted_completed_status_persisted', status_after, 'completed_failure');
  perform test.assert_true('trusted_completed_at_is_set', has_completed_at);
end;
$$;

-- The rejected updates above truly left the protected fields untouched.
do $$
declare
  goal text;
  tz text;
begin
  select activation_snapshot ->> 'goal', timezone into goal, tz
    from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  perform test.assert_equals('snapshot_goal_unchanged', goal, 'Sleep better');
  perform test.assert_equals('timezone_unchanged', tz, 'Europe/Stockholm');
end;
$$;

-- Correction event: a correction pointing at another challenge's event must be rejected by the composite FK.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values ('99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation');
select test.assert_fails(
  'cross_challenge_correction_denied',
  $stmt$insert into public.check_in_events (id, challenge_id, owner_id, event_type, event_payload, source, client_recorded_at, correction_of_event_id)
    values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'correction', jsonb_build_object('note', 'oops'), 'server', now(), 'eeeeeeee-0000-0000-0000-000000000001')$stmt$,
  '23503'
);

-- A correction within the SAME challenge succeeds (the source event still exists at this point).
do $$
declare
  before_count bigint;
  after_count bigint;
begin
  select count(*) into before_count from public.check_in_events where event_type = 'correction';
  insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at, correction_of_event_id)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'correction', jsonb_build_object('note', 'fixed'), 'server', now(), 'eeeeeeee-0000-0000-0000-000000000001');
  select count(*) into after_count from public.check_in_events where event_type = 'correction';
  perform test.assert_equals('same_challenge_correction_succeeds', after_count - before_count, 1::bigint);
end;
$$;

-- Older Cut back totals are preserved (append semantics): two totals for the same period both remain queryable.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values ('88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation');
insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
  values ('77777777-0000-0000-0000-000000000007', '88888888-0000-0000-0000-000000000008', 1, 'day', now(), now() + interval '1 day', jsonb_build_object('type', 'maximum_value', 'maximum', 3));
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values ('66666666-0000-0000-0000-000000000006', '88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '77777777-0000-0000-0000-000000000007', 'cut_back_total', jsonb_build_object('currentTotal', 2, 'unit', 'times'), 'ios', now());
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values (gen_random_uuid(), '88888888-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '77777777-0000-0000-0000-000000000007', 'cut_back_total', jsonb_build_object('currentTotal', 5, 'unit', 'times'), 'ios', now());
do $$
declare
  total_count bigint;
  first_total text;
begin
  select count(*) into total_count from public.check_in_events where challenge_id = '88888888-0000-0000-0000-000000000008' and event_type = 'cut_back_total';
  perform test.assert_equals('older_cut_back_total_preserved', total_count, 2::bigint);
  select event_payload ->> 'currentTotal' into first_total from public.check_in_events where id = '66666666-0000-0000-0000-000000000006';
  perform test.assert_equals('older_total_value_intact', first_total, '2');
end;
$$;

-- check_in_events: append-only for every role, including the trusted service_role.
select test.assert_fails(
  'checkin_update_denied_even_for_service_role',
  $stmt$update public.check_in_events set event_payload = jsonb_build_object('behaviorCompleted', false) where id = 'eeeeeeee-0000-0000-0000-000000000001'$stmt$,
  '23000'
);
select test.assert_fails(
  'checkin_delete_denied_even_for_service_role',
  $stmt$delete from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001'$stmt$,
  '23000'
);

-- The original event genuinely survived the two rejected attempts above.
do $$
declare
  persisted boolean;
begin
  select (event_payload ->> 'behaviorCompleted')::boolean into persisted
    from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001';
  perform test.assert_equals('original_event_survives', persisted, true);
end;
$$;
