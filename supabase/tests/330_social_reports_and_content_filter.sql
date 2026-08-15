-- Exercises 20260902000000_social_reports_and_content_filter.sql: the
-- trusted content filter at profiles.display_name and challenge activation,
-- and the private.social_reports authorization boundary behind
-- submit_social_report. G and H are accepted Kin; I is a total stranger
-- (no kin_connections row at all); J is pending with G; K's connection to
-- G was removed; L is blocked with G.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('95111111-0000-0000-0000-000000000001', 'social-g@example.test'),
    ('95111111-0000-0000-0000-000000000002', 'social-h@example.test'),
    ('95111111-0000-0000-0000-000000000003', 'social-i@example.test'),
    ('95111111-0000-0000-0000-000000000004', 'social-j@example.test'),
    ('95111111-0000-0000-0000-000000000005', 'social-k@example.test'),
    ('95111111-0000-0000-0000-000000000006', 'social-l@example.test');
  insert into public.kin_connections (id, requester_id, recipient_id, status) values
    (gen_random_uuid(), '95111111-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000002', 'accepted'),
    (gen_random_uuid(), '95111111-0000-0000-0000-000000000004', '95111111-0000-0000-0000-000000000001', 'pending'),
    (gen_random_uuid(), '95111111-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000005', 'removed');
  insert into public.kin_connections (id, requester_id, recipient_id, status, blocked_by)
    values (gen_random_uuid(), '95111111-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000006', 'blocked', '95111111-0000-0000-0000-000000000001');
end;
$$;
reset role;

-- ---------------------------------------------------------------------
-- Content filter: profiles.display_name
-- ---------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000001', false);
update public.profiles set display_name = 'Ouch King 3000' where id = '95111111-0000-0000-0000-000000000001';
select test.assert_equals('friendly_roast_display_name_is_allowed',
  (select display_name from public.profiles where id = '95111111-0000-0000-0000-000000000001'), 'Ouch King 3000');
select test.assert_fails('disallowed_display_name_is_rejected',
  $stmt$update public.profiles set display_name = 'total asshole' where id = '95111111-0000-0000-0000-000000000001'$stmt$,
  '22023');
-- Word-boundary matching: "class" must not false-positive on the "ass" substring.
update public.profiles set display_name = 'Classy McClassface' where id = '95111111-0000-0000-0000-000000000001';
select test.assert_equals('word_boundary_does_not_false_positive',
  (select display_name from public.profiles where id = '95111111-0000-0000-0000-000000000001'), 'Classy McClassface');
reset role;

-- ---------------------------------------------------------------------
-- Content filter: challenge activation (behavior / completionDefinition / recipient name)
-- ---------------------------------------------------------------------

set role service_role;
do $$
begin
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    '96222222-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000001', 1,
    jsonb_build_object(
      'schemaVersion', 1, 'id', '96222222-0000-0000-0000-000000000001', 'ownerId', '95111111-0000-0000-0000-000000000001',
      'goal', 'A goal', 'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Done', 'rule', jsonb_build_object('direction', 'build')),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(), 'rewardOrganizer', null, 'experienceCategory', null,
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', false,
      'invitationMessage', '', 'membershipSelection', null
    ),
    'archived'
  );
  insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status)
    values ('97333333-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000001', '96222222-0000-0000-0000-000000000001', 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), '97333333-0000-0000-0000-000000000001', '95111111-0000-0000-0000-000000000001', 'authorized', 5000, 'USD', 'authorized', now());
end;
$$;
reset role;

-- Disallowed text in behavior.description blocks activation entirely (the
-- whole transaction rolls back) -- the challenge never reaches 'active'.
select test.assert_fails('disallowed_behavior_text_blocks_activation',
  $stmt$update public.challenges set
    challenge_status = 'active', timezone = 'Europe/Stockholm', activated_at = now(),
    starts_at = now(), planned_ends_at = now() + interval '28 days',
    activation_snapshot = jsonb_build_object(
      'id', '97333333-0000-0000-0000-000000000001', 'ownerId', '95111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'A goal',
      'behavior', jsonb_build_object('description', 'total bitch', 'completionDefinition', 'Done'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
    where id = '97333333-0000-0000-0000-000000000001'$stmt$,
  '22023');
select test.assert_equals('rejected_activation_never_reaches_active',
  (select challenge_status from public.challenges where id = '97333333-0000-0000-0000-000000000001'),
  'pending_activation');

-- Disallowed text in a recipient's typed name is rejected the same way.
select test.assert_fails('disallowed_recipient_name_blocks_activation',
  $stmt$update public.challenges set
    challenge_status = 'active', timezone = 'Europe/Stockholm', activated_at = now(),
    starts_at = now(), planned_ends_at = now() + interval '28 days',
    activation_snapshot = jsonb_build_object(
      'id', '97333333-0000-0000-0000-000000000001', 'ownerId', '95111111-0000-0000-0000-000000000001',
      'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'A goal',
      'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Done'),
      'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'total bastard')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
    where id = '97333333-0000-0000-0000-000000000001'$stmt$,
  '22023');

-- A real, friendly-roast-toned activation with no disallowed terms succeeds normally.
set role service_role;
update public.challenges set
  challenge_status = 'active', timezone = 'Europe/Stockholm', activated_at = now(),
  starts_at = now(), planned_ends_at = now() + interval '28 days',
  activation_snapshot = jsonb_build_object(
    'id', '97333333-0000-0000-0000-000000000001', 'ownerId', '95111111-0000-0000-0000-000000000001',
    'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'A goal',
    'behavior', jsonb_build_object('description', 'No slacking off, champ', 'completionDefinition', 'Done'),
    'duration', jsonb_build_object('unit', 'week', 'value', 4), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
    'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
    'membershipStatusAtActivation', 'trialing'
  )
  where id = '97333333-0000-0000-0000-000000000001';
select test.assert_equals('allowed_text_activates_normally',
  (select challenge_status from public.challenges where id = '97333333-0000-0000-0000-000000000001'),
  'active');
select test.assert_equals('allowed_activation_creates_started_activity',
  (select count(*) from public.social_activity where challenge_id = '97333333-0000-0000-0000-000000000001' and kind = 'challenge_started'),
  1::bigint);
-- Stashed in a session-level GUC (readable regardless of which role/JWT is
-- later active, unlike a plain SELECT against social_activity, which is
-- exactly the RLS-gated table the stranger test below must not be able to
-- read) so the real activity id can be reused below without granting the
-- stranger any actual visibility into it.
do $$
declare
  v_activity_id uuid;
begin
  select id into v_activity_id from public.social_activity where challenge_id = '97333333-0000-0000-0000-000000000001' and kind = 'challenge_started';
  perform set_config('test.reported_activity_id', v_activity_id::text, false);
end;
$$;
reset role;

-- ---------------------------------------------------------------------
-- submit_social_report: authorization boundary
-- ---------------------------------------------------------------------

-- G cannot report themselves.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000001', false);
select test.assert_fails('cannot_report_yourself',
  $stmt$select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'harassment', null)$stmt$,
  '22023');
reset role;

-- H reports G's real challenge_started activity -- the actual real path.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_activity_id uuid;
  v_result jsonb;
begin
  select id into v_activity_id from public.social_activity where challenge_id = '97333333-0000-0000-0000-000000000001' and kind = 'challenge_started';
  select public.submit_social_report('95111111-0000-0000-0000-000000000001', v_activity_id, 'harassment', 'not cool') into v_result;
  perform test.assert_equals('report_submits', v_result ->> 'status', 'submitted');
end;
$$;
reset role;

-- Reporting the exact same target+activity again is idempotent, not a new row.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_activity_id uuid;
  v_result jsonb;
begin
  select id into v_activity_id from public.social_activity where challenge_id = '97333333-0000-0000-0000-000000000001' and kind = 'challenge_started';
  select public.submit_social_report('95111111-0000-0000-0000-000000000001', v_activity_id, 'harassment', 'again') into v_result;
  perform test.assert_equals('repeat_report_is_already_reported', v_result ->> 'status', 'already_reported');
end;
$$;
reset role;

-- I (a stranger, not Kin with G at all) cannot report G's activity -- can't
-- see it, so the server reports "not found," never leaking that it exists.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000003', false);
select test.assert_fails('stranger_cannot_report_unseen_activity',
  format($stmt$select public.submit_social_report('95111111-0000-0000-0000-000000000001', %L::uuid, 'harassment', null)$stmt$,
    current_setting('test.reported_activity_id')),
  'P0002');
-- I has no kin_connections row with G at all -- a profile-level report
-- (no activity id) is rejected the same way, not a "report anyone" primitive.
select test.assert_fails('stranger_cannot_report_unconnected_profile',
  $stmt$select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'harassment', null)$stmt$,
  'P0002');
reset role;

-- ---------------------------------------------------------------------
-- Profile-level report visibility must match profiles_select_kin exactly
-- (pending or accepted only) -- not "any kin_connections row ever".
-- ---------------------------------------------------------------------

-- H: accepted Kin with G -- can profile-report (a distinct target from
-- H's earlier activity-level report above, so this is a genuinely new row).
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
select test.assert_equals('accepted_kin_can_profile_report',
  (select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'spam', null) ->> 'status'),
  'submitted');
reset role;

-- J: pending with G (J is the requester, G the recipient) -- matches
-- profiles_select_kin's own (status in ('pending','accepted')) rule, so a
-- profile-level report is allowed even before G ever accepts.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000004', false);
select test.assert_equals('pending_kin_can_profile_report',
  (select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'spam', null) ->> 'status'),
  'submitted');
reset role;

-- K: connection to G was removed -- no longer profile-visible via
-- profiles_select_kin, so cannot profile-report either.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000005', false);
select test.assert_fails('removed_connection_cannot_profile_report',
  $stmt$select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'spam', null)$stmt$,
  'P0002');
reset role;

-- L: blocked with G -- also not profile-visible, same rejection.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000006', false);
select test.assert_fails('blocked_connection_cannot_profile_report',
  $stmt$select public.submit_social_report('95111111-0000-0000-0000-000000000001', null, 'spam', null)$stmt$,
  'P0002');
reset role;

-- No ordinary authenticated caller — reporter, reported user, or a
-- stranger — can read private.social_reports directly; the schema-wide
-- revoke (20260803000000_initial_kinwin_schema.sql) leaves it with zero
-- table privileges outside service_role.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
select test.assert_fails('reporter_cannot_read_reports_table_directly',
  $stmt$select * from private.social_reports$stmt$, '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000001', false);
select test.assert_fails('reported_user_cannot_read_reports_table_directly',
  $stmt$select * from private.social_reports$stmt$, '42501');
reset role;

-- The operational review path: service_role sees exactly the three real,
-- open reports created above (H's activity report, H's profile report,
-- J's profile report), with the true reporter/target/reason recorded on
-- the original activity-level one.
set role service_role;
select test.assert_equals('exactly_three_open_reports_exist',
  (select count(*) from private.social_reports where status = 'open'), 3::bigint);
do $$
declare
  v_row private.social_reports%rowtype;
begin
  select * into v_row from private.social_reports
    where status = 'open' and reason = 'harassment' and reported_activity_id is not null;
  perform test.assert_equals('report_reporter_is_the_real_caller', v_row.reporter_user_id, '95111111-0000-0000-0000-000000000002'::uuid);
  perform test.assert_equals('report_target_is_correct', v_row.reported_user_id, '95111111-0000-0000-0000-000000000001'::uuid);
  perform test.assert_equals('report_reason_is_correct', v_row.reason, 'harassment');
end;
$$;

-- ---------------------------------------------------------------------
-- Dedupe prevents spam, not future incidents: resolving a report frees
-- the same reporter+target to submit a genuinely new one.
-- ---------------------------------------------------------------------

-- Resolve H's original (activity-level) report.
do $$
declare
  v_report_id uuid;
begin
  select id into v_report_id from private.social_reports
    where status = 'open' and reason = 'harassment' and reported_activity_id is not null;
  update private.social_reports set status = 'resolved', resolved_at = now() where id = v_report_id;
end;
$$;
reset role;

-- H reports the same activity again -- now genuinely fresh, not a duplicate
-- of the (now-resolved) earlier one.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
select test.assert_equals('fresh_report_after_resolution_is_submitted',
  (select public.submit_social_report(
    '95111111-0000-0000-0000-000000000001', current_setting('test.reported_activity_id')::uuid, 'harassment', 'still going on'
  ) ->> 'status'),
  'submitted');
reset role;

set role service_role;
select test.assert_equals('resolution_leaves_two_reports_for_that_activity_target',
  (select count(*) from private.social_reports
    where reporter_user_id = '95111111-0000-0000-0000-000000000002' and reported_activity_id is not null),
  2::bigint);
reset role;

-- Submitting a third time while the fresh one is still open is a duplicate again.
set role authenticated;
select set_config('request.jwt.claim.sub', '95111111-0000-0000-0000-000000000002', false);
select test.assert_equals('duplicate_while_open_is_still_already_reported',
  (select public.submit_social_report(
    '95111111-0000-0000-0000-000000000001', current_setting('test.reported_activity_id')::uuid, 'harassment', 'again'
  ) ->> 'status'),
  'already_reported');
reset role;

-- ---------------------------------------------------------------------
-- Deleting the referenced social_activity row must never fail or be
-- blocked because of the report/dedupe structure -- reported_activity_id
-- is an opaque historical value, not a live foreign key. If this were
-- still a live FK (the pre-fix design), this delete would either fail
-- outright or silently null out reported_activity_id and collide with
-- the partial unique index's coalesce-to-sentinel row.
-- ---------------------------------------------------------------------
set role service_role;
delete from public.social_activity where id = current_setting('test.reported_activity_id')::uuid;
select test.assert_equals('deleting_reported_activity_actually_removed_it',
  (select count(*) from public.social_activity where id = current_setting('test.reported_activity_id')::uuid),
  0::bigint);
select test.assert_equals('report_rows_survive_activity_deletion_unmutated',
  (select count(*) from private.social_reports where reported_activity_id = current_setting('test.reported_activity_id')::uuid),
  2::bigint);
reset role;
reset role;
