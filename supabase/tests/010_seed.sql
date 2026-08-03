-- Seeds two auth users and a representative row in every public/private table,
-- written as a trusted party (bypasses RLS). Used as the fixture for every
-- other test file in this directory. Local test harness only.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.test');

insert into public.profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Owner A'),
  ('22222222-2222-2222-2222-222222222222', 'Owner B');

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
