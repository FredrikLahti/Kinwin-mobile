-- Exercises reading a pending commitment and public.cancel_pending_challenge
-- (20260806000000): the trusted RPC boundary that lets the owner cancel a
-- pending_activation challenge before activation, atomically, idempotently,
-- and only for their own challenge — preserving every row.
--
-- Only one pending_activation challenge may ever exist per owner
-- (challenges_owner_one_pending_idx, added in
-- 20260808000000_one_pending_commitment_per_owner.sql), so every test
-- below that needs the pending challenge bbbbbbbb-…0002 to still be
-- pending runs before the "successful cancellation" test — after that, it
-- stays canceled for the rest of this file.
--
-- Created here (as service_role, the shape prepare_challenge_from_draft
-- itself would have left) rather than in 010_seed.sql: by the time this
-- file runs, 090_prepare_challenge_from_draft.sql has already created and
-- canceled its own pending commitment for Owner A, so this is the first
-- point Owner A is guaranteed to have zero — seeding one any earlier would
-- collide with 090's own tests.
set role service_role;
insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000008', 1, 1, 'pending_activation');
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order, recipient_role) values
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Anna', 0, 'recipient_organizer');
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('ffffffff-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'payment_method_required', 7500, 'USD');
reset role;

-- Owner A can read their own pending commitment (challenge, recipients,
-- consequence) — the same client-side read path the new repository method
-- uses, protected only by the RLS/grants already proven in 020-040.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  status_val text;
  recipient_count bigint;
  consequence_status text;
begin
  select challenge_status into status_val from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('owner_reads_own_pending_challenge', status_val, 'pending_activation');

  select count(*) into recipient_count from public.challenge_recipients where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('owner_reads_own_pending_recipients', recipient_count, 1::bigint);

  select status into consequence_status from public.consequences where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('owner_reads_own_pending_consequence', consequence_status, 'payment_method_required');
end;
$$;

-- Another authenticated user cannot read it: RLS filters to zero rows, not an error.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select test.assert_equals(
  'non_owner_cannot_read_pending_challenge',
  (select count(*) from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0::bigint
);

-- Another authenticated user cannot cancel it either — rejected
-- identically to "not found", and leaves it untouched. Runs while
-- bbbbbbbb-…0002 is still pending, before Owner A's own cancellation below.
select test.assert_fails(
  'non_owner_cannot_cancel_pending_challenge',
  $stmt$select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000002')$stmt$,
  'P0002'
);
reset role;
set role service_role;
do $$
declare
  status_val text;
  consequence_status_val text;
begin
  select challenge_status into status_val from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('non_owner_cancel_attempt_leaves_challenge_untouched', status_val, 'pending_activation');
  select status into consequence_status_val from public.consequences where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('non_owner_cancel_attempt_leaves_consequence_untouched', consequence_status_val, 'payment_method_required');
end;
$$;
reset role;

-- Signed-out access is denied outright (no grant on challenges at all).
set role anon;
select test.assert_fails(
  'anon_cannot_read_pending_challenge',
  $stmt$select count(*) from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002'$stmt$,
  '42501'
);
reset role;

-- Successful, atomic cancellation.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare
  result jsonb;
begin
  select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('cancel_returns_canceled_status', result ->> 'status', 'canceled_before_activation');
  perform test.assert_equals('cancel_returns_same_challenge_id', (result ->> 'challengeId')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid);
end;
$$;

do $$
declare
  challenge_status_val text;
  consequence_status_val text;
  recipient_count bigint;
  draft_status_val text;
begin
  select challenge_status into challenge_status_val from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('canceled_challenge_status_persisted', challenge_status_val, 'canceled_before_activation');

  -- The consequence was canceled in the same transaction.
  select status into consequence_status_val from public.consequences where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('canceled_consequence_status_persisted', consequence_status_val, 'canceled_before_activation');

  -- Nothing was deleted: the recipient row and the archived source draft both survive untouched.
  select count(*) into recipient_count from public.challenge_recipients where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('canceled_challenge_recipients_preserved', recipient_count, 1::bigint);
  select draft_status into draft_status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000008';
  perform test.assert_equals('canceled_challenge_source_draft_still_archived', draft_status_val, 'archived');
end;
$$;

-- Repeated cancellation of the same challenge is idempotent.
do $$
declare
  result jsonb;
  challenge_count bigint;
begin
  select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('repeat_cancel_returns_same_status', result ->> 'status', 'canceled_before_activation');
  perform test.assert_equals('repeat_cancel_returns_same_challenge_id', (result ->> 'challengeId')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid);
  select count(*) into challenge_count from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform test.assert_equals('repeat_cancel_creates_no_duplicate', challenge_count, 1::bigint);
end;
$$;

-- The user can create a new draft after cancellation — nothing about a
-- canceled commitment blocks starting a fresh one.
do $$
declare
  new_draft_count bigint;
begin
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'aaaaaaaa-0000-0000-0000-00000000000a',
    '11111111-1111-1111-1111-111111111111',
    1,
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'aaaaaaaa-0000-0000-0000-00000000000a',
      'ownerId', '11111111-1111-1111-1111-111111111111',
      'goal', 'Read more',
      'behavior', jsonb_build_object('description', 'Read before bed', 'completionDefinition', 'Read for 20 minutes', 'rule', jsonb_build_object('direction', 'build')),
      'duration', jsonb_build_object('unit', 'week', 'value', 4),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(),
      'rewardOrganizer', null,
      'experienceCategory', null,
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'),
      'sitOutAcknowledged', false,
      'invitationMessage', '',
      'membershipSelection', null
    ),
    'editing'
  );
  select count(*) into new_draft_count from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  perform test.assert_equals('new_draft_after_cancellation_created', new_draft_count, 1::bigint);
end;
$$;

-- An active challenge cannot be canceled through this RPC.
select test.assert_fails(
  'active_challenge_cancel_rejected',
  $stmt$select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000004')$stmt$,
  '22023'
);
do $$
declare
  status_val text;
begin
  select challenge_status into status_val from public.challenges where id = 'bbbbbbbb-0000-0000-0000-000000000004';
  perform test.assert_equals('active_challenge_status_unchanged_after_rejected_cancel', status_val, 'active');
end;
$$;

-- An unknown challenge id is rejected the same way as one owned by someone else.
select test.assert_fails(
  'unknown_challenge_cancel_rejected',
  $stmt$select public.cancel_pending_challenge('99999999-9999-9999-9999-999999999998')$stmt$,
  'P0002'
);
reset role;

-- A request with no real identity (auth.uid() is null) is rejected before any lookup.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select test.assert_fails(
  'unauthenticated_cancel_rejected',
  $stmt$select public.cancel_pending_challenge('bbbbbbbb-0000-0000-0000-000000000002')$stmt$,
  '28000'
);
reset role;

-- Anonymous clients have no execute grant on this function at all.
set role anon;
select test.assert_fails('anon_cannot_call_cancel_function', 'select public.cancel_pending_challenge(gen_random_uuid())', '42501');
reset role;

-- Direct client writes to the canceled rows remain impossible.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails(
  'direct_challenge_status_update_still_denied',
  $stmt$update public.challenges set challenge_status = 'active' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$stmt$,
  '42501'
);
select test.assert_fails(
  'direct_consequence_status_update_still_denied',
  $stmt$update public.consequences set status = 'authorized' where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000002'$stmt$,
  '42501'
);
reset role;
