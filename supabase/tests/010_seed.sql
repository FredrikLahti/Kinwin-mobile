-- Seeds two auth users and a representative row in every public/private table,
-- written as a trusted party (bypasses RLS). Used as the fixture for every
-- other test file in this directory. Local test harness only.

-- The on_auth_user_created trigger (20260804000000_profile_on_signup.sql)
-- already inserts a bare public.profiles row for each of these; the upsert
-- below only adds a display name on top of that trigger-created row, rather
-- than racing or duplicating it.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.test');

insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Owner A'),
  ('22222222-2222-2222-2222-222222222222', 'Owner B')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build')),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(),
    'rewardOrganizer', null,
    'experienceCategory', null,
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', false,
    'invitationMessage', '',
    'membershipSelection', null
  ),
  'editing'
);

insert into public.challenges (
  id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
  timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
) values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000001',
  1, 1, 'active',
  'Europe/Stockholm', now(), now(), now() + interval '28 days',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'bbbbbbbb-0000-0000-0000-000000000001',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'ruleEngineVersion', 1,
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session'),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'consequenceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'membershipStatusAtActivation', 'trialing'
  )
);

insert into public.challenge_recipients (id, challenge_id, display_name, sort_order, recipient_role) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Anna', 0, 'recipient_organizer');

insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, target_payload) values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 1, 'day', now(), now() + interval '1 day', jsonb_build_object('type', 'completion_target', 'target', 1));

insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'build_completion', jsonb_build_object('behaviorCompleted', true), 'ios', now());

insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('ffffffff-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'authorized', 7500, 'USD');

insert into public.invitations (id, challenge_id, owner_id, recipient_id, invitation_status) values
  ('11111111-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'draft');

insert into public.memberships (id, owner_id, membership_status, access_mode, trial_ends_at) values
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'trialing', 'full', now() + interval '7 days');

insert into private.consequence_provider_references (consequence_id, payment_provider, customer_reference) values
  ('ffffffff-0000-0000-0000-000000000001', 'stripe', 'cus_test123');

insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at) values
  ('33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'idem-1', 1, 'succeeded', 7500, 'USD', now());

insert into private.reward_fulfillments (id, consequence_id, fulfillment_provider, status, amount_minor_units, currency, requested_at) values
  ('44444444-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000001', 'tremendous', 'pending', 7500, 'USD', now());

-- Additional drafts for 09X_prepare_challenge_from_draft.sql, which needs
-- genuinely complete, ready_for_activation payloads (unlike the loose
-- aaaaaaaa-...0001 draft above) to exercise the RPC's success path, plus a
-- few deliberately imperfect siblings for its rejection paths. All owned by
-- Owner A unless noted.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000002',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);

-- Complete and ready, but reserved for the "another user cannot prepare
-- this draft" test — never consumed by the success-path test above.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000003',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);

-- Marked ready_for_activation (passing challenge_drafts' own coarse CHECK
-- constraints) but missing several commitment fields the RPC itself must
-- still reject: no recipients, no organizer, no experience category, the
-- sit-out promise not acknowledged, no invitation message, no membership
-- selection.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000004',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build')),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(),
    'rewardOrganizer', null,
    'experienceCategory', null,
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', false,
    'invitationMessage', '',
    'membershipSelection', null
  ),
  'ready_for_activation'
);

-- Otherwise-complete payload that is simply not ready yet.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000005',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000005',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'editing'
);

-- Complete and ready, reserved for the atomicity/rollback test — must stay
-- untouched by every other test above so a failed downstream statement has
-- something fresh to roll back.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000006',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000006',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);

-- Otherwise fully complete and valid — every field but behavior.rule/
-- successRule isolates the one gap 090_prepare_challenge_from_draft.sql's
-- rule-validation test exists for: a bare {"direction":"build"} rule with
-- no measurement or rhythm, and a successRule missing every build-specific
-- field. challenge_drafts' own CHECK constraints only require these to be
-- JSON objects, so this still satisfies them.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000007',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000007',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build')),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);

-- Fixtures for 100_cancel_pending_challenge.sql: server-owned pending
-- commitments as prepare_challenge_from_draft would have left them (source
-- draft archived, challenge_recipients + consequences already created),
-- inserted directly as a trusted party rather than by calling the RPC, so
-- this file stays independent of 090's own test flow.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-000000000008',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-000000000008',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'archived'
);

-- Its pending challenge (bbbbbbbb-…0002) is *not* seeded here — Owner A
-- must have zero pending_activation challenges at seed time so
-- 090_prepare_challenge_from_draft.sql's own tests (which create and then
-- clean up a real one) don't collide with challenges_owner_one_pending_idx.
-- 100_cancel_pending_challenge.sql creates it inline instead, once 090 has
-- already finished and canceled its own.


-- Already active (fully activated, own snapshot) — reserved for the
-- "cancellation of an active challenge is rejected" test.
insert into public.challenges (
  id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
  timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
) values (
  'bbbbbbbb-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  null,
  1, 1, 'active',
  'Europe/Stockholm', now(), now(), now() + interval '28 days',
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'bbbbbbbb-0000-0000-0000-000000000004',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'ruleEngineVersion', 1,
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session'),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'consequenceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'membershipStatusAtActivation', 'trialing'
  )
);

-- Archived draft fixture for 110_archived_draft_immutability.sql —
-- deliberately minimal since only draft_status matters for that test.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-00000000000b',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-00000000000b',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Sleep better',
    'behavior', jsonb_build_object('description', 'Strength train', 'completionDefinition', 'Complete the planned session', 'rule', jsonb_build_object('direction', 'build')),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(),
    'rewardOrganizer', null,
    'experienceCategory', null,
    'stake', jsonb_build_object('minorUnits', 7500, 'currency', 'USD'),
    'sitOutAcknowledged', false,
    'invitationMessage', '',
    'membershipSelection', null
  ),
  'archived'
);

-- Fixture for 120_one_pending_commitment_per_owner.sql: an otherwise fully
-- valid, ready_for_activation draft. That file creates its own pending
-- commitment fixture directly (as service_role) rather than seeding one
-- here, since the new challenges_owner_one_pending_idx unique index means
-- Owner A can never have two pending_activation challenges seeded at once
-- — 100_cancel_pending_challenge.sql's own pending fixture (cccccccc-…0002)
-- must already be canceled before another can exist, which only happens
-- while that file runs, not at seed time.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-00000000000f',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-00000000000f',
    'ownerId', '11111111-1111-1111-1111-111111111111',
    'goal', 'Read more',
    'behavior', jsonb_build_object('description', 'Read before bed', 'completionDefinition', 'Read for 20 minutes', 'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'), 'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 4),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 28, 'minimumRequiredCompletions', 20, 'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Björn')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'wellness',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'),
    'sitOutAcknowledged', true,
    'invitationMessage', 'Join me in this promise.',
    'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
