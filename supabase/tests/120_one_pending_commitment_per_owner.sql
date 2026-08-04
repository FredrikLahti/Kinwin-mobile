-- Exercises the one-pending-commitment-per-owner invariant added in
-- 20260808000000_one_pending_commitment_per_owner.sql: the unique partial
-- index itself, prepare_challenge_from_draft's application-level rejection
-- of a second draft while one is already pending, and that canceling the
-- existing one unblocks preparing the next.
--
-- By this point in the file order, 100_cancel_pending_challenge.sql has
-- already canceled its own pending fixture, so Owner A has zero pending
-- challenges — this file creates its own (as service_role, the same shape
-- prepare_challenge_from_draft itself would have left) rather than seeding
-- one statically, since challenges_owner_one_pending_idx would otherwise
-- reject seeding two pending challenges for the same owner at once.

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'aaaaaaaa-0000-0000-0000-00000000000e',
  '11111111-1111-1111-1111-111111111111',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'id', 'aaaaaaaa-0000-0000-0000-00000000000e',
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
insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status) values
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000e', 1, 1, 'pending_activation');
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order, recipient_role) values
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', 'Anna', 0, 'recipient_organizer');
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('ffffffff-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'payment_method_required', 7500, 'USD');
reset role;

-- The unique index enforces this even for the trusted role, independent of
-- any application logic.
set role service_role;
select test.assert_fails(
  'second_pending_challenge_insert_denied_by_unique_index',
  $stmt$insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1, 1, 'pending_activation')$stmt$,
  '23505'
);
reset role;

-- Preparing a second, otherwise fully valid draft while one commitment is
-- already pending is rejected — and nothing is created or archived.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails(
  'second_prepare_rejected_while_one_pending',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-00000000000f')$stmt$,
  '22023'
);
do $$
declare
  draft_status_val text;
  challenge_count bigint;
begin
  select draft_status into draft_status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000f';
  perform test.assert_equals('second_draft_left_untouched', draft_status_val, 'ready_for_activation');
  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-00000000000f';
  perform test.assert_equals('second_draft_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;

-- The existing pending commitment is completely unaffected by the rejected attempt.
do $$
declare
  status_val text;
begin
  select challenge_status into status_val from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000005';
  perform test.assert_equals('first_pending_commitment_unaffected', status_val, 'pending_activation');
end;
$$;

-- Canceling the existing pending commitment unblocks preparing the next one.
do $$
declare
  result jsonb;
begin
  select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000005') into result;
  perform test.assert_equals('first_pending_commitment_canceled', result ->> 'status', 'canceled_before_activation');
end;
$$;
do $$
declare
  result jsonb;
begin
  select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-00000000000f') into result;
  perform test.assert_equals('second_prepare_succeeds_after_cancellation', result ->> 'status', 'pending_activation');
end;
$$;
reset role;
