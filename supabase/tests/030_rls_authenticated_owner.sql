-- Owner (Owner A, 1111...1111) acting as `authenticated`.
-- Expected: full read/write of own profile and drafts; read-only for
-- activated/runtime records; no write path exists for those at all.
-- Every expectation below is machine-asserted, not read from a transcript.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- Reads: owner sees exactly their own row in every table.
select test.assert_equals('owner_sees_own_profile', (select count(*) from public.profiles), 1::bigint);
-- Nine drafts: the original loose fixture plus six added for
-- 090_prepare_challenge_from_draft.sql and two added for
-- 100_cancel_pending_challenge.sql (see 010_seed.sql).
select test.assert_equals('owner_sees_own_draft', (select count(*) from public.challenge_drafts), 9::bigint);
-- Four challenges: the original activated one plus three added for
-- 100_cancel_pending_challenge.sql (two pending, one active).
select test.assert_equals('owner_sees_own_challenge', (select count(*) from public.challenges), 4::bigint);
select test.assert_equals('owner_sees_own_recipients', (select count(*) from public.challenge_recipients), 3::bigint);
select test.assert_equals('owner_sees_own_periods', (select count(*) from public.challenge_periods), 1::bigint);
select test.assert_equals('owner_sees_own_checkins', (select count(*) from public.check_in_events), 1::bigint);
select test.assert_equals('owner_sees_own_consequences', (select count(*) from public.consequences), 3::bigint);
select test.assert_equals('owner_sees_own_invitations', (select count(*) from public.invitations), 1::bigint);
select test.assert_equals('owner_sees_own_membership', (select count(*) from public.memberships), 1::bigint);

-- Writes: owner can update their own draft and profile — assert both the
-- affected row count and the persisted value.
do $$
declare
  affected bigint;
  persisted text;
begin
  update public.challenge_drafts set draft_status = 'ready_for_activation' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  perform test.assert_equals('owner_updates_own_draft_rowcount', affected, 1::bigint);

  select draft_status into persisted from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform test.assert_equals('owner_draft_status_persisted', persisted, 'ready_for_activation');
end;
$$;

do $$
declare
  affected bigint;
  persisted text;
begin
  update public.profiles set display_name = 'Owner A Renamed' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics affected = row_count;
  perform test.assert_equals('owner_updates_own_profile_rowcount', affected, 1::bigint);

  select display_name into persisted from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  perform test.assert_equals('owner_profile_name_persisted', persisted, 'Owner A Renamed');
end;
$$;

-- Expected failures: no grant exists for writing activated/runtime tables at all.
select test.assert_fails(
  'owner_insert_challenge_denied',
  $stmt$insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation')$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_update_challenge_denied',
  $stmt$update public.challenges set challenge_status = 'completed_success' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_insert_checkin_denied',
  $stmt$insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'build_completion', jsonb_build_object('behaviorCompleted', true), 'ios', now())$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_update_checkin_denied',
  $stmt$update public.check_in_events set event_payload = jsonb_build_object('behaviorCompleted', false) where id = 'eeeeeeee-0000-0000-0000-000000000001'$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_delete_checkin_denied',
  $stmt$delete from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001'$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_insert_consequence_denied',
  $stmt$insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'draft', 100, 'USD')$stmt$,
  '42501'
);

select test.assert_fails(
  'owner_update_membership_denied',
  $stmt$update public.memberships set membership_status = 'active' where owner_id = '11111111-1111-1111-1111-111111111111'$stmt$,
  '42501'
);

-- Confirm the check-in row genuinely survived the two rejected mutation attempts above.
do $$
declare
  persisted boolean;
begin
  select (event_payload ->> 'behaviorCompleted')::boolean into persisted
    from public.check_in_events where id = 'eeeeeeee-0000-0000-0000-000000000001';
  perform test.assert_equals('owner_checkin_survives_denied_mutations', persisted, true);
end;
$$;
