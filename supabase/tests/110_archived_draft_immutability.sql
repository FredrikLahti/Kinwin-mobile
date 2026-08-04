-- Exercises the archived-draft immutability triggers added in
-- 20260807000000_archived_draft_immutability.sql: once a draft's
-- draft_status is 'archived' (the state prepare_challenge_from_draft
-- leaves it in), no role can update or delete that row, even though the
-- owner's UPDATE/DELETE grants on challenge_drafts are not themselves
-- scoped to draft_status.

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select test.assert_fails(
  'archived_draft_update_denied',
  $stmt$update public.challenge_drafts set draft_payload = draft_payload || jsonb_build_object('goal', 'Tampered goal') where id = 'aaaaaaaa-0000-0000-0000-00000000000b'$stmt$,
  '23000'
);
select test.assert_fails(
  'archived_draft_status_change_denied',
  $stmt$update public.challenge_drafts set draft_status = 'editing' where id = 'aaaaaaaa-0000-0000-0000-00000000000b'$stmt$,
  '23000'
);
select test.assert_fails(
  'archived_draft_delete_denied',
  $stmt$delete from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000b'$stmt$,
  '23000'
);

-- The archived row genuinely survived every rejected attempt above.
do $$
declare
  goal_val text;
  status_val text;
begin
  select draft_payload ->> 'goal', draft_status into goal_val, status_val
    from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  perform test.assert_equals('archived_draft_goal_unchanged', goal_val, 'Sleep better');
  perform test.assert_equals('archived_draft_status_unchanged', status_val, 'archived');
end;
$$;

-- The trigger is scoped to already-archived rows: a non-archived draft the
-- owner creates remains fully editable and deletable, exactly as before.
do $$
declare
  affected bigint;
  persisted text;
begin
  insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
    'aaaaaaaa-0000-0000-0000-00000000000d',
    '11111111-1111-1111-1111-111111111111',
    1,
    jsonb_build_object(
      'schemaVersion', 1,
      'id', 'aaaaaaaa-0000-0000-0000-00000000000d',
      'ownerId', '11111111-1111-1111-1111-111111111111',
      'goal', 'Drink more water',
      'behavior', jsonb_build_object('description', 'Drink water', 'completionDefinition', 'Drink a full glass', 'rule', jsonb_build_object('direction', 'build')),
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

  update public.challenge_drafts set draft_status = 'ready_for_activation' where id = 'aaaaaaaa-0000-0000-0000-00000000000d';
  get diagnostics affected = row_count;
  perform test.assert_equals('non_archived_draft_still_updatable_rowcount', affected, 1::bigint);
  select draft_status into persisted from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000d';
  perform test.assert_equals('non_archived_draft_still_updatable_persisted', persisted, 'ready_for_activation');

  delete from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-00000000000d';
  get diagnostics affected = row_count;
  perform test.assert_equals('non_archived_draft_still_deletable', affected, 1::bigint);
end;
$$;

-- Immutability holds for the trusted role too, not just the client.
reset role;
set role service_role;
select test.assert_fails(
  'archived_draft_update_denied_even_for_service_role',
  $stmt$update public.challenge_drafts set draft_status = 'editing' where id = 'aaaaaaaa-0000-0000-0000-00000000000b'$stmt$,
  '23000'
);
reset role;
