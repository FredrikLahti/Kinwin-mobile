-- Exercises supabase/migrations/20260903000000_account_deletion.sql:
-- private.account_deletion_blocker's eligibility branches,
-- public.check_account_deletion_eligibility's owner-scoped read, the
-- narrow trigger bypasses on check_in_events/archived challenge_drafts/
-- challenge_reward_organizers (proving they stay rejected for every
-- ordinary DELETE/UPDATE and are only ever bypassed from inside
-- private.delete_account_owned_data), and a full graph deletion. Uses
-- fresh 34xxxxxx-prefixed owners throughout, independent of the shared
-- seed data (010_seed.sql) and every other file's accumulated state — see
-- 290_canonical_reward_organizer.sql for the same fresh-id convention.
--
-- The real supabase.auth.admin.deleteUser(...) call is GoTrue/HTTP-only
-- and cannot run against a bare Postgres instance — see
-- supabase/tests/e2e/account-deletion.e2e.ts for that half of the
-- boundary (and for the fuller, more realistic end-to-end scenarios this
-- file does not attempt to duplicate). This file's job is the SQL logic
-- in isolation: private.delete_account_owned_data never deletes
-- auth.users itself, so it is fully exercisable here.

set role service_role;

-- ---------------------------------------------------------------------
-- Fixture helper: a minimal, valid, already-terminal-shaped challenge for
-- a fresh owner, with a consequence and the trigger-created canonical
-- reward organizer. Mirrors the exact activation_snapshot shape
-- public.challenges' own CHECK constraint requires.
-- ---------------------------------------------------------------------
do $$
declare
  v_owners uuid[] := array[
    '34000000-0000-0000-0000-000000000001'::uuid, -- X1: active challenge (blocks)
    '34000000-0000-0000-0000-000000000002'::uuid, -- X2: completed_failure, no charge attempt (blocks)
    '34000000-0000-0000-0000-000000000003'::uuid, -- X3: completed_failure, charge succeeded, no reward (blocks)
    '34000000-0000-0000-0000-000000000004'::uuid, -- X4: fully resolved — comprehensive delete target
    '34000000-0000-0000-0000-000000000005'::uuid, -- X5: isolation check (untouched by X4's deletion)
    '34000000-0000-0000-0000-000000000006'::uuid  -- X6: kin target for X4
  ];
  v_owner uuid;
begin
  foreach v_owner in array v_owners loop
    insert into auth.users (id, email) values (v_owner, 'deletion-' || v_owner || '@example.test');
    insert into public.profiles (id, display_name, kin_code) values (v_owner, 'Deletion Test', substr(replace(v_owner::text, '-', ''), 1, 8))
      on conflict (id) do nothing;
  end loop;
end $$;

-- X1: active challenge blocks deletion outright.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status, timezone, activated_at, starts_at, planned_ends_at, activation_snapshot) values (
  '34100000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 1, 1, 'active',
  'UTC', now(), now(), now() + interval '14 days',
  jsonb_build_object('schemaVersion',1,'id','34100000-0000-0000-0000-000000000001','ownerId','34000000-0000-0000-0000-000000000001','ruleEngineVersion',1,
    'goal','Sleep better','behavior',jsonb_build_object('description','x','completionDefinition','x'),'duration',jsonb_build_object('unit','week','value',2),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1),'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','other','name','Alex'),'consequenceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing')
);
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('34100000-0000-0000-0000-000000000011', '34100000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'payment_method_required', 5000, 'USD');

set role authenticated;
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000001', false);
do $$
declare result jsonb;
begin
  select public.check_account_deletion_eligibility() into result;
  perform test.assert_equals('active_challenge_preflight_eligible', result->>'eligible', 'false');
  perform test.assert_equals('active_challenge_preflight_reason', result->>'reason', 'active_challenge');
end $$;
reset role;

set role service_role;
select test.assert_fails(
  'active_challenge_delete_rejected',
  $stmt$select private.delete_account_owned_data('34000000-0000-0000-0000-000000000001'::uuid)$stmt$,
  '22023'
);
do $$
declare still_exists boolean;
begin
  select exists(select 1 from public.challenges where id = '34100000-0000-0000-0000-000000000001') into still_exists;
  perform test.assert_true('active_challenge_rejected_delete_left_data_untouched', still_exists);
end $$;

-- X2: completed_failure with no charge attempt yet blocks with payment_recovery_pending.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status, timezone, activated_at, starts_at, planned_ends_at, completed_at, activation_snapshot) values (
  '34200000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000002', 1, 1, 'completed_failure',
  'UTC', now(), now(), now() + interval '14 days', now(),
  jsonb_build_object('schemaVersion',1,'id','34200000-0000-0000-0000-000000000001','ownerId','34000000-0000-0000-0000-000000000002','ruleEngineVersion',1,
    'goal','Sleep better','behavior',jsonb_build_object('description','x','completionDefinition','x'),'duration',jsonb_build_object('unit','week','value',2),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1),'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','other','name','Alex'),'consequenceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing')
);
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('34200000-0000-0000-0000-000000000011', '34200000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000002', 'payment_method_required', 5000, 'USD');

set role authenticated;
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000002', false);
do $$
declare result jsonb;
begin
  select public.check_account_deletion_eligibility() into result;
  perform test.assert_equals('no_charge_attempt_blocks', result->>'reason', 'payment_recovery_pending');
end $$;
reset role;

set role service_role;
select test.assert_fails(
  'no_charge_attempt_delete_rejected',
  $stmt$select private.delete_account_owned_data('34000000-0000-0000-0000-000000000002'::uuid)$stmt$,
  '22023'
);

-- X3: completed_failure, charge succeeded, no reward fulfillment yet blocks with reward_fulfillment_pending.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status, timezone, activated_at, starts_at, planned_ends_at, completed_at, activation_snapshot) values (
  '34300000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000003', 1, 1, 'completed_failure',
  'UTC', now(), now(), now() + interval '14 days', now(),
  jsonb_build_object('schemaVersion',1,'id','34300000-0000-0000-0000-000000000001','ownerId','34000000-0000-0000-0000-000000000003','ruleEngineVersion',1,
    'goal','Sleep better','behavior',jsonb_build_object('description','x','completionDefinition','x'),'duration',jsonb_build_object('unit','week','value',2),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1),'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','other','name','Alex'),'consequenceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing')
);
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('34300000-0000-0000-0000-000000000011', '34300000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000003', 'payment_method_required', 5000, 'USD');
insert into private.consequence_charge_attempts (consequence_id, owner_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at, completed_at, stripe_customer_id, stripe_payment_method_id, stripe_payment_intent_id) values
  ('34300000-0000-0000-0000-000000000011', '34000000-0000-0000-0000-000000000003', 'idem-34300000-1', 1, 'succeeded', 5000, 'USD', now(), now(), 'cus_34300000', 'pm_34300000', 'pi_34300000');

set role authenticated;
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000003', false);
do $$
declare result jsonb;
begin
  select public.check_account_deletion_eligibility() into result;
  perform test.assert_equals('charge_succeeded_no_reward_blocks', result->>'reason', 'reward_fulfillment_pending');
end $$;
reset role;

set role service_role;
select test.assert_fails(
  'charge_succeeded_no_reward_delete_rejected',
  $stmt$select private.delete_account_owned_data('34000000-0000-0000-0000-000000000003'::uuid)$stmt$,
  '22023'
);

-- X4: fully resolved — the comprehensive delete target. Includes a
-- correction check-in, a canonical reward organizer (trigger-created on
-- the consequences insert below), an archived draft, a Kin connection to
-- X6, a Playbook entry, and an invitation — proving the trigger bypasses
-- and the full ordered delete all work together, not just in isolation.
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  '34400000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000004', 1,
  jsonb_build_object('schemaVersion',1,'id','34400000-0000-0000-0000-000000000002','ownerId','34000000-0000-0000-0000-000000000004','goal','Sleep better',
    'behavior',jsonb_build_object('description','x','completionDefinition','x','rule',jsonb_build_object('direction','build')),'duration',jsonb_build_object('unit','week','value',2),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1),'recipients',jsonb_build_array(),'rewardOrganizer',null,'experienceCategory',null,
    'stake',jsonb_build_object('minorUnits',5000,'currency','USD'),'sitOutAcknowledged',false,'invitationMessage','','membershipSelection',null),
  'archived'
);
insert into public.challenges (id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status, timezone, activated_at, starts_at, planned_ends_at, completed_at, activation_snapshot) values (
  '34400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000004', '34400000-0000-0000-0000-000000000002', 1, 1, 'completed_failure',
  'UTC', now(), now(), now() + interval '14 days', now(),
  jsonb_build_object('schemaVersion',1,'id','34400000-0000-0000-0000-000000000001','ownerId','34000000-0000-0000-0000-000000000004','ruleEngineVersion',1,
    'goal','Sleep better','behavior',jsonb_build_object('description','x','completionDefinition','x'),'duration',jsonb_build_object('unit','week','value',2),
    'successRule',jsonb_build_object('direction','build','ruleVersion',1),'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Anna')),
    'rewardOrganizer',jsonb_build_object('type','other','name','Alex'),'consequenceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),
    'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing')
);
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order) values
  ('34400000-0000-0000-0000-000000000003', '34400000-0000-0000-0000-000000000001', 'Anna', 0);
insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload) values
  ('34400000-0000-0000-0000-000000000004', '34400000-0000-0000-0000-000000000001', 1, 'day', now(), now() + interval '1 day', now() + interval '2 days', jsonb_build_object('note', 'e2e'));
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at) values
  ('34400000-0000-0000-0000-000000000005', '34400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000004', '34400000-0000-0000-0000-000000000004', 'build_completion', jsonb_build_object('completions', 1), 'server', now());
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at, correction_of_event_id) values
  ('34400000-0000-0000-0000-000000000006', '34400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000004', '34400000-0000-0000-0000-000000000004', 'correction', jsonb_build_object('completions', 2), 'server', now(), '34400000-0000-0000-0000-000000000005');
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency) values
  ('34400000-0000-0000-0000-000000000011', '34400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000004', 'payment_method_required', 5000, 'USD');
insert into private.consequence_charge_attempts (consequence_id, owner_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at, completed_at, stripe_customer_id, stripe_payment_method_id, stripe_payment_intent_id) values
  ('34400000-0000-0000-0000-000000000011', '34000000-0000-0000-0000-000000000004', 'idem-34400000-1', 1, 'succeeded', 5000, 'USD', now(), now(), 'cus_34400000', 'pm_34400000', 'pi_34400000');
insert into private.reward_fulfillments (consequence_id, idempotency_key, fulfillment_provider, status, amount_minor_units, currency, requested_at, delivered_at, provider_status, provider_order_id, provider_reward_id) values
  ('34400000-0000-0000-0000-000000000011', 'e2e-reward-34400000', 'tremendous_sandbox', 'delivered', 5000, 'USD', now(), now(), 'SUCCEEDED', 'order_34400000', 'reward_34400000');
insert into public.invitations (id, challenge_id, owner_id, recipient_id, invitation_status) values
  ('34400000-0000-0000-0000-000000000007', '34400000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000004', '34400000-0000-0000-0000-000000000003', 'ready');
insert into public.playbook_entries (id, owner_id, category, content) values
  ('34400000-0000-0000-0000-000000000008', '34000000-0000-0000-0000-000000000004', 'lesson', 'Small steps compound.');
insert into public.kin_connections (id, requester_id, recipient_id, status) values
  ('34400000-0000-0000-0000-000000000009', '34000000-0000-0000-0000-000000000004', '34000000-0000-0000-0000-000000000006', 'pending');

-- The canonical reward organizer must exist (trigger-created on the
-- consequences insert above) before proving anything about deleting it.
do $$
declare organizer_id uuid;
begin
  select id into organizer_id from public.challenge_reward_organizers where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_true('x4_canonical_reward_organizer_exists', organizer_id is not null);
end $$;

-- Regression: ordinary direct mutation of all three protected tables is
-- STILL rejected outside delete_account_owned_data — the bypass this
-- migration adds is genuinely narrow, not a general weakening.
select test.assert_fails(
  'x4_direct_checkin_delete_still_rejected',
  $stmt$delete from public.check_in_events where id = '34400000-0000-0000-0000-000000000005'$stmt$,
  '23000'
);
select test.assert_fails(
  'x4_direct_archived_draft_delete_still_rejected',
  $stmt$delete from public.challenge_drafts where id = '34400000-0000-0000-0000-000000000002'$stmt$,
  '23000'
);
select test.assert_fails(
  'x4_direct_reward_organizer_delete_still_rejected',
  $stmt$delete from public.challenge_reward_organizers where challenge_id = '34400000-0000-0000-0000-000000000001'$stmt$,
  '23000'
);
select test.assert_fails(
  'x4_direct_reward_organizer_update_still_rejected',
  $stmt$update public.challenge_reward_organizers set display_name = 'Tampered' where challenge_id = '34400000-0000-0000-0000-000000000001'$stmt$,
  '23000'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000004', false);
do $$
declare result jsonb;
begin
  select public.check_account_deletion_eligibility() into result;
  perform test.assert_equals('x4_preflight_eligible', result->>'eligible', 'true');
end $$;
reset role;

set role service_role;
do $$
begin
  perform private.delete_account_owned_data('34000000-0000-0000-0000-000000000004'::uuid);
end $$;

do $$
declare
  remaining bigint;
begin
  select count(*) into remaining from public.challenges where id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_challenge_gone', remaining, 0::bigint);
  select count(*) into remaining from public.challenge_recipients where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_recipients_gone', remaining, 0::bigint);
  select count(*) into remaining from public.challenge_periods where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_periods_gone', remaining, 0::bigint);
  select count(*) into remaining from public.check_in_events where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_checkins_gone', remaining, 0::bigint);
  select count(*) into remaining from public.consequences where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_consequences_gone', remaining, 0::bigint);
  select count(*) into remaining from private.consequence_charge_attempts where consequence_id = '34400000-0000-0000-0000-000000000011';
  perform test.assert_equals('x4_charge_attempts_gone', remaining, 0::bigint);
  select count(*) into remaining from private.reward_fulfillments where consequence_id = '34400000-0000-0000-0000-000000000011';
  perform test.assert_equals('x4_reward_fulfillments_gone', remaining, 0::bigint);
  select count(*) into remaining from public.challenge_reward_organizers where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_reward_organizer_gone', remaining, 0::bigint);
  select count(*) into remaining from public.invitations where challenge_id = '34400000-0000-0000-0000-000000000001';
  perform test.assert_equals('x4_invitations_gone', remaining, 0::bigint);
  select count(*) into remaining from public.challenge_drafts where id = '34400000-0000-0000-0000-000000000002';
  perform test.assert_equals('x4_archived_draft_gone', remaining, 0::bigint);
  select count(*) into remaining from public.playbook_entries where owner_id = '34000000-0000-0000-0000-000000000004';
  perform test.assert_equals('x4_playbook_gone', remaining, 0::bigint);
  select count(*) into remaining from public.kin_connections where requester_id = '34000000-0000-0000-0000-000000000004';
  perform test.assert_equals('x4_kin_connection_gone', remaining, 0::bigint);
  select count(*) into remaining from public.profiles where id = '34000000-0000-0000-0000-000000000004';
  perform test.assert_equals('x4_profile_gone', remaining, 0::bigint);
  -- auth.users itself is untouched by this SQL function by design — the
  -- Admin API call in supabase/functions/delete-account/index.ts removes
  -- it, after this function has already committed. See file header.
  select count(*) into remaining from auth.users where id = '34000000-0000-0000-0000-000000000004';
  perform test.assert_equals('x4_auth_user_row_survives_this_sql_function_by_design', remaining, 1::bigint);
end $$;

-- Isolation: none of X4's deletion touched X5 (an unrelated owner with no
-- fixtures of its own here) or X6 (the Kin connection's other party).
do $$
declare remaining bigint;
begin
  select count(*) into remaining from public.profiles where id = '34000000-0000-0000-0000-000000000005';
  perform test.assert_equals('x5_profile_untouched', remaining, 1::bigint);
  select count(*) into remaining from public.profiles where id = '34000000-0000-0000-0000-000000000006';
  perform test.assert_equals('x6_profile_untouched', remaining, 1::bigint);
end $$;

-- Idempotency at the SQL layer: calling delete_account_owned_data again
-- for an owner with nothing left to delete is a safe no-op, not an error
-- — the eligibility check finds no non-terminal challenge (there are
-- none left at all) and every delete matches zero rows.
do $$
begin
  perform private.delete_account_owned_data('34000000-0000-0000-0000-000000000004'::uuid);
end $$;

reset role;
