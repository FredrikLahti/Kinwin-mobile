-- True multi-currency V1 (20260908000000_multi_currency_v1.sql): USD/SEK/EUR
-- are all genuine V1 commitment currencies, end to end — no FX conversion
-- anywhere in Kinwin. USD acceptance at every layer already has extensive
-- coverage elsewhere in this suite (090/150/350 and others); this file adds
-- the SEK/EUR coverage those predate, plus the new preferred_currency
-- column and the unsupported-currency rejection at the RPC boundary (the
-- table-level rejection is covered by 070_constraints.sql's
-- consequence_unsupported_currency_denied).
--
-- Fixed UUIDs throughout, matching 090/150/350's own convention, so
-- set_config's JWT sub claim can reference the same owner across role
-- switches.

set role service_role;
insert into auth.users (id, email) values
  ('37111111-0000-0000-0000-000000000001', 'currency-sek@example.test'),
  ('37111111-0000-0000-0000-000000000002', 'currency-eur@example.test'),
  ('37111111-0000-0000-0000-000000000003', 'currency-unsupported@example.test');
reset role;

-- --- SEK: full pipeline (prepare -> authorize -> activate) ----------------

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '37222222-0000-0000-0000-000000000001',
  '37111111-0000-0000-0000-000000000001',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '37222222-0000-0000-0000-000000000001', 'ownerId', '37111111-0000-0000-0000-000000000001',
    'goal', 'Feel stronger',
    'behavior', jsonb_build_object('description', 'Morning run', 'completionDefinition', 'Complete a run',
      'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
        'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 2),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
      'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 50000, 'currency', 'SEK'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000001', false);
do $$
declare result jsonb;
begin
  select public.prepare_challenge_from_draft('37222222-0000-0000-0000-000000000001') into result;
  perform test.assert_equals('sek_draft_prepared', result ->> 'status', 'pending_activation');
end;
$$;
reset role;

set role service_role;
do $$
declare
  new_challenge_id uuid;
  consequence_currency text;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000001';
  select currency into consequence_currency from public.consequences where challenge_id = new_challenge_id;
  perform test.assert_equals('sek_consequence_currency', consequence_currency, 'SEK');

  -- Simulate a verified webhook having authorized payment (the real path is
  -- supabase/functions/stripe-consequence-webhook) so activation's own
  -- currency-agnostic snapshot copy can be proven independently of it.
  update public.consequences set authorization_status = 'authorized', authorized_at = now()
    where challenge_id = new_challenge_id;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000001', false);
do $$
declare new_challenge_id uuid;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000001';
  perform public.activate_challenge_draft(new_challenge_id, 'Europe/Stockholm');
end;
$$;
reset role;

set role service_role;
do $$
declare
  new_challenge_id uuid;
  snapshot_currency text;
  consequence_currency text;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000001';
  select activation_snapshot #>> '{stake,currency}' into snapshot_currency from public.challenges where id = new_challenge_id;
  select currency into consequence_currency from public.consequences where challenge_id = new_challenge_id;
  perform test.assert_equals('sek_activation_snapshot_currency', snapshot_currency, 'SEK');
  perform test.assert_equals('sek_activation_snapshot_matches_consequence', snapshot_currency, consequence_currency);
end;
$$;
reset role;

-- --- EUR: full pipeline (prepare -> authorize -> activate) ----------------

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '37222222-0000-0000-0000-000000000002',
  '37111111-0000-0000-0000-000000000002',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '37222222-0000-0000-0000-000000000002', 'ownerId', '37111111-0000-0000-0000-000000000002',
    'goal', 'Feel stronger',
    'behavior', jsonb_build_object('description', 'Morning run', 'completionDefinition', 'Complete a run',
      'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
        'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 2),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
      'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'EUR'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000002', false);
do $$
declare result jsonb;
begin
  select public.prepare_challenge_from_draft('37222222-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('eur_draft_prepared', result ->> 'status', 'pending_activation');
end;
$$;
reset role;

set role service_role;
do $$
declare
  new_challenge_id uuid;
  consequence_currency text;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000002';
  select currency into consequence_currency from public.consequences where challenge_id = new_challenge_id;
  perform test.assert_equals('eur_consequence_currency', consequence_currency, 'EUR');
  update public.consequences set authorization_status = 'authorized', authorized_at = now()
    where challenge_id = new_challenge_id;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000002', false);
do $$
declare new_challenge_id uuid;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000002';
  perform public.activate_challenge_draft(new_challenge_id, 'Europe/Stockholm');
end;
$$;
reset role;

set role service_role;
do $$
declare
  new_challenge_id uuid;
  snapshot_currency text;
  consequence_currency text;
begin
  select id into new_challenge_id from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000002';
  select activation_snapshot #>> '{stake,currency}' into snapshot_currency from public.challenges where id = new_challenge_id;
  select currency into consequence_currency from public.consequences where challenge_id = new_challenge_id;
  perform test.assert_equals('eur_activation_snapshot_currency', snapshot_currency, 'EUR');
  perform test.assert_equals('eur_activation_snapshot_matches_consequence', snapshot_currency, consequence_currency);
end;
$$;
reset role;

-- --- Unsupported currency: rejected server-side, at the RPC boundary too --

set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '37222222-0000-0000-0000-000000000003',
  '37111111-0000-0000-0000-000000000003',
  1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', '37222222-0000-0000-0000-000000000003', 'ownerId', '37111111-0000-0000-0000-000000000003',
    'goal', 'Feel stronger',
    'behavior', jsonb_build_object('description', 'Morning run', 'completionDefinition', 'Complete a run',
      'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
        'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 2),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
      'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'GBP'),
    'sitOutAcknowledged', true, 'invitationMessage', 'Join me in this promise.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000003', false);
select test.assert_fails(
  'unsupported_currency_draft_rejected_at_rpc',
  $stmt$select public.prepare_challenge_from_draft('37222222-0000-0000-0000-000000000003')$stmt$,
  '22023'
);
reset role;
set role service_role;
do $$
declare challenge_count bigint;
begin
  select count(*) into challenge_count from public.challenges where source_draft_id = '37222222-0000-0000-0000-000000000003';
  perform test.assert_equals('unsupported_currency_draft_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;
reset role;

-- --- profiles.preferred_currency: default null, USD/SEK/EUR accepted,
-- anything else rejected. Exercised as the real `authenticated` role (not
-- service_role) so this also proves the new column-level grant actually
-- lets a real client update it, exactly like updateShowChallengeIntro's
-- own show_challenge_intro grant. Never touches any other profile column
-- or any draft/challenge — see docs/PRODUCT_DECISIONS.md.

set role service_role;
do $$
declare current_preference text;
begin
  select preferred_currency into current_preference from public.profiles where id = '37111111-0000-0000-0000-000000000001';
  perform test.assert_equals('preferred_currency_defaults_null', current_preference, null::text);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000001', false);
select test.assert_fails(
  'preferred_currency_unsupported_value_denied',
  $stmt$update public.profiles set preferred_currency = 'GBP' where id = '37111111-0000-0000-0000-000000000001'$stmt$,
  '23514'
);

do $$
begin
  update public.profiles set preferred_currency = 'SEK' where id = '37111111-0000-0000-0000-000000000001';
  perform test.assert_equals('preferred_currency_sek_accepted',
    (select preferred_currency from public.profiles where id = '37111111-0000-0000-0000-000000000001'), 'SEK');
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000002', false);
do $$
begin
  update public.profiles set preferred_currency = 'EUR' where id = '37111111-0000-0000-0000-000000000002';
  perform test.assert_equals('preferred_currency_eur_accepted',
    (select preferred_currency from public.profiles where id = '37111111-0000-0000-0000-000000000002'), 'EUR');
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000003', false);
do $$
begin
  update public.profiles set preferred_currency = 'USD' where id = '37111111-0000-0000-0000-000000000003';
  perform test.assert_equals('preferred_currency_usd_accepted',
    (select preferred_currency from public.profiles where id = '37111111-0000-0000-0000-000000000003'), 'USD');
end;
$$;
reset role;

-- A signed-in user still cannot update another owner's preferred_currency
-- (profiles_update_own's RLS check, not the new column grant, is what's
-- under test here — the grant alone is column-scoped, not row-scoped).
set role authenticated;
select set_config('request.jwt.claim.sub', '37111111-0000-0000-0000-000000000001', false);
do $$
declare updated_rows bigint;
begin
  update public.profiles set preferred_currency = 'EUR' where id = '37111111-0000-0000-0000-000000000002';
  get diagnostics updated_rows = row_count;
  perform test.assert_equals('preferred_currency_cannot_update_other_owner', updated_rows, 0::bigint);
end;
$$;
reset role;
