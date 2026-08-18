-- Success Means (successRule ruleVersion 2) — trusted server boundary
-- coverage for 20260906000000_success_means_v2.sql's redefinition of
-- public.prepare_challenge_from_draft. See that migration's own header for
-- the full design; this file proves it end to end against the real RPC,
-- the same way 090_prepare_challenge_from_draft.sql proves the V1 boundary.
--
-- The core claim under test: a malicious client cannot save a V2 draft
-- whose selected overall minimum is below Kinwin's independently
-- re-derived baseline (or above the re-derived total), no matter what the
-- draft's own totalPlannedCompletions/minimumRequiredCompletions claim —
-- and a genuinely valid, stricter-than-baseline V2 draft is accepted and
-- behaves identically to a V1 draft otherwise (one challenge row, correct
-- recipients/consequence, draft archived).
--
-- Fixture: 4 weeks, daily build (or day-bounded cut_back) -> total 28,
-- Kinwin's true baseline 25 (verified against the JS formula's own test
-- coverage in domain/challenge/success-rule.test.ts).

set role service_role;
insert into auth.users(id,email) values('35111111-0000-0000-0000-000000000001','success-means-build@test.invalid');
insert into auth.users(id,email) values('35111111-0000-0000-0000-000000000002','success-means-limit@test.invalid');
insert into auth.users(id,email) values('35111111-0000-0000-0000-000000000003','success-means-avoid@test.invalid');
reset role;

-- --- Build ---------------------------------------------------------------

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35aaaaaa-0000-0000-0000-000000000001',
  '35111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35aaaaaa-0000-0000-0000-000000000001', 'ownerId', '35111111-0000-0000-0000-000000000001',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    -- Malicious: claims a genuine baseline=25/28 total but a selected
    -- minimum of 10 — far below Kinwin's real baseline.
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 2, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 10, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'v2_build_below_baseline_selection_rejected',
  $stmt$select public.prepare_challenge_from_draft('35aaaaaa-0000-0000-0000-000000000001')$stmt$,
  '22023'
);
reset role;
set role service_role;
do $$
declare challenge_count bigint;
begin
  select count(*) into challenge_count from public.challenges where source_draft_id = '35aaaaaa-0000-0000-0000-000000000001';
  perform test.assert_equals('v2_build_below_baseline_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;

-- Malicious: selection above the true total.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35aaaaaa-0000-0000-0000-000000000002',
  '35111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35aaaaaa-0000-0000-0000-000000000002', 'ownerId', '35111111-0000-0000-0000-000000000001',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 2, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 999, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'v2_build_above_total_selection_rejected',
  $stmt$select public.prepare_challenge_from_draft('35aaaaaa-0000-0000-0000-000000000002')$stmt$,
  '22023'
);
reset role;

-- Malicious: claims an inflated totalPlannedCompletions to try to make a
-- weak selection look "within range" of a fabricated total. The server
-- never trusts the draft's own total — it is re-derived from duration and
-- rhythm alone, so this is rejected on the total mismatch itself.
set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35aaaaaa-0000-0000-0000-000000000003',
  '35111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35aaaaaa-0000-0000-0000-000000000003', 'ownerId', '35111111-0000-0000-0000-000000000001',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 2, 'totalPlannedCompletions', 200, 'minimumRequiredCompletions', 50, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'v2_build_fabricated_total_rejected',
  $stmt$select public.prepare_challenge_from_draft('35aaaaaa-0000-0000-0000-000000000003')$stmt$,
  '22023'
);
reset role;

-- Malicious: a valid total/minimum but a gutted continuity safeguard
-- (maximum_consecutive_missed_days: 999 instead of Kinwin's fixed 2). The
-- overall threshold alone being in bounds must never be enough — the
-- safeguard itself must also match the server-derived baseline exactly.
set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35aaaaaa-0000-0000-0000-000000000005',
  '35111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35aaaaaa-0000-0000-0000-000000000005', 'ownerId', '35111111-0000-0000-0000-000000000001',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 2, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 27, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 999), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'v2_build_gutted_continuity_safeguard_rejected',
  $stmt$select public.prepare_challenge_from_draft('35aaaaaa-0000-0000-0000-000000000005')$stmt$,
  '22023'
);
reset role;

-- A genuinely valid, stricter-than-baseline V2 selection is accepted and
-- behaves exactly like a V1 success (see 090's success-path assertions —
-- not fully re-duplicated here, just the key shape checks).
set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35aaaaaa-0000-0000-0000-000000000004',
  '35111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35aaaaaa-0000-0000-0000-000000000004', 'ownerId', '35111111-0000-0000-0000-000000000001',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 2, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 27, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
do $$
declare result jsonb;
begin
  select public.prepare_challenge_from_draft('35aaaaaa-0000-0000-0000-000000000004') into result;
  perform test.assert_equals('v2_build_valid_stricter_selection_accepted', result ->> 'status', 'pending_activation');
end;
$$;
reset role;
set role service_role;
do $$
declare draft_status_val text;
begin
  select draft_status into draft_status_val from public.challenge_drafts where id = '35aaaaaa-0000-0000-0000-000000000004';
  perform test.assert_equals('v2_build_valid_selection_archives_draft', draft_status_val, 'archived');
end;
$$;
reset role;

-- --- Limit (cut_back) -----------------------------------------------------

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35bbbbbb-0000-0000-0000-000000000001',
  '35111111-0000-0000-0000-000000000002',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35bbbbbb-0000-0000-0000-000000000001', 'ownerId', '35111111-0000-0000-0000-000000000002',
    'goal', 'Drink less',
    'behavior', jsonb_build_object('description', 'Alcohol', 'completionDefinition', 'Stay under the limit', 'rule', jsonb_build_object('direction', 'cut_back', 'measurement', jsonb_build_object('type', 'count', 'unit', 'drinks'), 'boundary', jsonb_build_object('periodUnit', 'day', 'maximumValue', 3))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    -- Malicious: below the true baseline of 25.
    'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 2, 'measurementType', 'count', 'maximumAllowedValue', 3, 'periodUnit', 'day', 'totalPeriods', 28, 'minimumPeriodsWithinLimit', 10, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_exceeded_days', 'maximum', 2)),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000002', false);
select test.assert_fails(
  'v2_limit_below_baseline_selection_rejected',
  $stmt$select public.prepare_challenge_from_draft('35bbbbbb-0000-0000-0000-000000000001')$stmt$,
  '22023'
);
reset role;

-- Malicious: valid total/minimum but a gutted continuity safeguard. Runs
-- before Owner 35...002's one successful preparation below, so this
-- rejection is never masked by "another pending commitment already
-- exists" — see the analogous ordering fix this needed for the exact
-- same reason (Codex review on this PR caught the underlying validation
-- gap this proves is closed).
set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35bbbbbb-0000-0000-0000-000000000003',
  '35111111-0000-0000-0000-000000000002',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35bbbbbb-0000-0000-0000-000000000003', 'ownerId', '35111111-0000-0000-0000-000000000002',
    'goal', 'Drink less',
    'behavior', jsonb_build_object('description', 'Alcohol', 'completionDefinition', 'Stay under the limit', 'rule', jsonb_build_object('direction', 'cut_back', 'measurement', jsonb_build_object('type', 'count', 'unit', 'drinks'), 'boundary', jsonb_build_object('periodUnit', 'day', 'maximumValue', 3))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 2, 'measurementType', 'count', 'maximumAllowedValue', 3, 'periodUnit', 'day', 'totalPeriods', 28, 'minimumPeriodsWithinLimit', 27, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_exceeded_days', 'maximum', 999)),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000002', false);
select test.assert_fails(
  'v2_limit_gutted_continuity_safeguard_rejected',
  $stmt$select public.prepare_challenge_from_draft('35bbbbbb-0000-0000-0000-000000000003')$stmt$,
  '22023'
);
reset role;

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35bbbbbb-0000-0000-0000-000000000002',
  '35111111-0000-0000-0000-000000000002',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35bbbbbb-0000-0000-0000-000000000002', 'ownerId', '35111111-0000-0000-0000-000000000002',
    'goal', 'Drink less',
    'behavior', jsonb_build_object('description', 'Alcohol', 'completionDefinition', 'Stay under the limit', 'rule', jsonb_build_object('direction', 'cut_back', 'measurement', jsonb_build_object('type', 'count', 'unit', 'drinks'), 'boundary', jsonb_build_object('periodUnit', 'day', 'maximumValue', 3))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'cut_back', 'ruleVersion', 2, 'measurementType', 'count', 'maximumAllowedValue', 3, 'periodUnit', 'day', 'totalPeriods', 28, 'minimumPeriodsWithinLimit', 27, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_exceeded_days', 'maximum', 2)),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000002', false);
do $$
declare result jsonb;
begin
  select public.prepare_challenge_from_draft('35bbbbbb-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('v2_limit_valid_stricter_selection_accepted', result ->> 'status', 'pending_activation');
end;
$$;
reset role;

-- --- Avoid (stop): no V2 at all --------------------------------------------

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '35cccccc-0000-0000-0000-000000000001',
  '35111111-0000-0000-0000-000000000003',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '35cccccc-0000-0000-0000-000000000001', 'ownerId', '35111111-0000-0000-0000-000000000003',
    'goal', 'Quit smoking',
    'behavior', jsonb_build_object('description', 'Smoking', 'completionDefinition', 'No cigarettes', 'rule', jsonb_build_object('direction', 'stop', 'measurement', jsonb_build_object('type', 'abstinence', 'unit', 'lapse'), 'boundary', jsonb_build_object('periodUnit', 'challenge', 'maximumLapses', 0))),
    'duration', jsonb_build_object('unit', 'week', 'value', 2),
    'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 2, 'lapseRule', jsonb_build_object('type', 'zero_lapses')),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000003', false);
select test.assert_fails(
  'v2_stop_rule_version_always_rejected',
  $stmt$select public.prepare_challenge_from_draft('35cccccc-0000-0000-0000-000000000001')$stmt$,
  '22023'
);
reset role;

-- Cleanup: cancel the two successful pending commitments this file created,
-- so no owner-scoped state leaks into files that run after this one.
set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000001', false);
do $$
declare captured_id uuid;
begin
  select id into captured_id from public.challenges where source_draft_id = '35aaaaaa-0000-0000-0000-000000000004';
  perform public.cancel_pending_challenge(captured_id);
end;
$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '35111111-0000-0000-0000-000000000002', false);
do $$
declare captured_id uuid;
begin
  select id into captured_id from public.challenges where source_draft_id = '35bbbbbb-0000-0000-0000-000000000002';
  perform public.cancel_pending_challenge(captured_id);
end;
$$;
reset role;
