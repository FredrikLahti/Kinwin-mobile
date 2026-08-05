-- Exercises the trusted Stripe consequence-setup foundation
-- (20260810000000_consequence_setup_stripe.sql): public.prepare_consequence_setup,
-- public.record_consequence_setup_attempt, and public.apply_consequence_setup_event.
-- Every fixture here is inserted directly as service_role with its own
-- freshly generated owner, so cases never collide with each other or with
-- other files' fixtures. Stripe itself is never called — these RPCs only
-- ever see already-decided Stripe object ids, exactly as the real Edge
-- Functions would pass them in after talking to Stripe (or, in tests, a
-- fake Stripe adapter).

set role service_role;

-- Fresh setup: no existing Stripe Customer, no reusable attempt; after
-- recording one, a repeated prepare call surfaces it for reuse instead of
-- signaling "create a new one".
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_prep jsonb;
  v_record jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-fresh@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  select public.prepare_consequence_setup(v_owner, v_challenge, null) into v_prep;
  perform test.assert_equals('fresh_challenge_id_matches', (v_prep ->> 'challengeId')::uuid, v_challenge);
  perform test.assert_equals('fresh_consequence_id_matches', (v_prep ->> 'consequenceId')::uuid, v_consequence);
  perform test.assert_true('fresh_no_existing_customer', v_prep -> 'existingStripeCustomerId' = 'null'::jsonb);
  perform test.assert_true('fresh_no_reusable_attempt', v_prep -> 'reusableSetupAttemptId' = 'null'::jsonb);

  -- Resolving by consequence id works identically to resolving by challenge id.
  select public.prepare_consequence_setup(v_owner, null, v_consequence) into v_prep;
  perform test.assert_equals('resolve_by_consequence_id_matches_challenge', (v_prep ->> 'challengeId')::uuid, v_challenge);

  select public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_fresh', 'seti_fresh') into v_record;
  perform test.assert_equals('record_returns_consequence_id', (v_record ->> 'consequenceId')::uuid, v_consequence);
  perform test.assert_equals('authorization_status_pending_after_first_attempt',
    (select authorization_status from public.consequences where id = v_consequence), 'pending');
  perform test.assert_equals('challenge_still_pending_activation_after_setup',
    (select challenge_status from public.challenges where id = v_challenge), 'pending_activation');
  perform test.assert_equals('consequence_not_active_after_setup',
    (select status from public.consequences where id = v_consequence), 'payment_method_required');

  select public.prepare_consequence_setup(v_owner, v_challenge, null) into v_prep;
  perform test.assert_equals('repeat_prepare_surfaces_existing_customer', v_prep ->> 'existingStripeCustomerId', 'cus_fresh');
  perform test.assert_equals('repeat_prepare_surfaces_reusable_setup_intent', v_prep ->> 'reusableStripeSetupIntentId', 'seti_fresh');
  perform test.assert_equals('repeat_prepare_surfaces_reusable_attempt_id',
    (v_prep ->> 'reusableSetupAttemptId')::uuid, (v_record ->> 'setupAttemptId')::uuid);
end;
$$;

-- Repeated calls for the same current attempt (an Edge Function retry
-- after, say, a lost response) do not create uncontrolled duplicates: the
-- same Stripe ids resolve to the same attempt row, not a new one.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_first jsonb;
  v_second jsonb;
  v_attempt_count bigint;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-retry@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  select public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_retry', 'seti_retry') into v_first;
  select public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_retry', 'seti_retry') into v_second;
  perform test.assert_equals('retry_record_returns_same_attempt_id', v_first ->> 'setupAttemptId', v_second ->> 'setupAttemptId');

  select count(*) into v_attempt_count from private.consequence_setup_attempts where consequence_id = v_consequence;
  perform test.assert_equals('retry_record_creates_no_duplicate_attempt_row', v_attempt_count, 1::bigint);

  -- Concurrency-safe Customer reuse: a "concurrent" caller that (thanks to
  -- a shared Stripe idempotency key) resolved to the very same Customer id
  -- must not error and must not create a second stripe_customers row.
  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_retry', 'seti_retry_2');
  perform test.assert_equals('customer_row_stays_singular_per_owner',
    (select count(*) from private.stripe_customers where owner_id = v_owner), 1::bigint);
  perform test.assert_equals('customer_id_unchanged_by_concurrent_reuse',
    (select stripe_customer_id from private.stripe_customers where owner_id = v_owner), 'cus_retry');
end;
$$;

-- Signed-out / non-owner rejection, without resource disclosure.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'setup-owner@example.test'), (v_stranger, 'setup-stranger@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  perform test.assert_fails('prepare_rejects_null_caller',
    format('select public.prepare_consequence_setup(null, %L::uuid, null)', v_challenge), '28000');
  perform test.assert_fails('prepare_rejects_foreign_owner_indistinguishable_from_not_found',
    format('select public.prepare_consequence_setup(%L::uuid, %L::uuid, null)', v_stranger, v_challenge), 'P0002');
  perform test.assert_fails('prepare_rejects_unknown_challenge',
    format('select public.prepare_consequence_setup(%L::uuid, gen_random_uuid(), null)', v_owner), 'P0002');
  perform test.assert_fails('record_rejects_foreign_owner',
    format('select public.record_consequence_setup_attempt(%L::uuid, %L::uuid, %L, %L)', v_stranger, v_challenge, 'cus_s', 'seti_s'), 'P0002');

  perform test.assert_equals('foreign_owner_attempts_create_no_rows',
    (select count(*) from private.consequence_setup_attempts where consequence_id = v_consequence), 0::bigint);
end;
$$;

-- Non-pending commitments (active, canceled, completed) are rejected by
-- both step-1 and step-2 RPCs; a missing consequence for an otherwise
-- pending challenge is also rejected as "not found" rather than crashing.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'setup-canceled@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'canceled_before_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (gen_random_uuid(), v_challenge, v_owner, 'canceled_before_activation', 7500, 'USD');
  perform test.assert_fails('prepare_rejects_canceled_challenge',
    format('select public.prepare_consequence_setup(%L::uuid, %L::uuid, null)', v_owner, v_challenge), '22023');
end;
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_owner, 'setup-no-consequence@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  perform test.assert_fails('prepare_rejects_missing_consequence',
    format('select public.prepare_consequence_setup(%L::uuid, %L::uuid, null)', v_owner, v_challenge), 'P0002');
end;
$$;

-- A signed, successful webhook atomically authorizes the consequence: the
-- provider reference, authorization_status, authorized_at, and the honest
-- pre-activation `authorized` status all move together, and the challenge
-- itself is never touched.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_webhook jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-success@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_ok', 'seti_ok');
  select public.apply_consequence_setup_event('evt_ok', 'setup_intent.succeeded', 'seti_ok', 'cus_ok', 'pm_ok', 'succeeded') into v_webhook;

  perform test.assert_equals('success_outcome', v_webhook ->> 'outcome', 'authorized');
  perform test.assert_equals('success_authorization_status', (select authorization_status from public.consequences where id = v_consequence), 'authorized');
  perform test.assert_equals('success_status', (select status from public.consequences where id = v_consequence), 'authorized');
  perform test.assert_true('success_authorized_at_set', (select authorized_at is not null from public.consequences where id = v_consequence));
  perform test.assert_equals('success_provider', (select payment_provider from private.consequence_provider_references where consequence_id = v_consequence), 'stripe');
  perform test.assert_equals('success_customer_ref', (select customer_reference from private.consequence_provider_references where consequence_id = v_consequence), 'cus_ok');
  perform test.assert_equals('success_payment_method_ref', (select payment_method_reference from private.consequence_provider_references where consequence_id = v_consequence), 'pm_ok');
  perform test.assert_equals('success_authorization_ref', (select authorization_reference from private.consequence_provider_references where consequence_id = v_consequence), 'seti_ok');
  perform test.assert_equals('success_challenge_untouched', (select challenge_status from public.challenges where id = v_challenge), 'pending_activation');
  perform test.assert_equals('success_attempt_status', (select status from private.consequence_setup_attempts where stripe_setup_intent_id = 'seti_ok'), 'succeeded');

  -- Duplicate delivery of the same Stripe event id is a pure no-op.
  select public.apply_consequence_setup_event('evt_ok', 'setup_intent.succeeded', 'seti_ok', 'cus_ok', 'pm_ok', 'succeeded') into v_webhook;
  perform test.assert_equals('duplicate_event_is_idempotent', v_webhook ->> 'outcome', 'duplicate_event');
end;
$$;

-- Failed and canceled SetupIntents with no prior authorization are
-- represented honestly at the consequence level (authorization_status
-- becomes 'failed'), never fabricating success.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_webhook jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-failed-fresh@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_fail', 'seti_fail');
  select public.apply_consequence_setup_event('evt_fail', 'setup_intent.setup_failed', 'seti_fail', 'cus_fail', null, 'failed') into v_webhook;
  perform test.assert_equals('fresh_failure_outcome', v_webhook ->> 'outcome', 'failed');
  perform test.assert_equals('fresh_failure_authorization_status', (select authorization_status from public.consequences where id = v_consequence), 'failed');
  perform test.assert_equals('fresh_failure_status_unchanged', (select status from public.consequences where id = v_consequence), 'payment_method_required');
  perform test.assert_true('fresh_failure_no_authorized_at', (select authorized_at is null from public.consequences where id = v_consequence));

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_fail', 'seti_cancel');
  select public.apply_consequence_setup_event('evt_cancel', 'setup_intent.canceled', 'seti_cancel', 'cus_fail', null, 'canceled') into v_webhook;
  perform test.assert_equals('cancel_outcome', v_webhook ->> 'outcome', 'canceled');
  perform test.assert_equals('cancel_attempt_status', (select status from private.consequence_setup_attempts where stripe_setup_intent_id = 'seti_cancel'), 'canceled');
end;
$$;

-- Replacement keeps the old authorization until the new setup succeeds, and
-- a superseded (old) attempt's late event can never overwrite the current
-- method — the two guarantees that matter most for this package.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_webhook jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-replace@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_r', 'seti_r1');
  select public.apply_consequence_setup_event('evt_r1', 'setup_intent.succeeded', 'seti_r1', 'cus_r', 'pm_r1', 'succeeded') into v_webhook;
  perform test.assert_equals('replace_first_authorized', v_webhook ->> 'outcome', 'authorized');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_r', 'seti_r2');
  perform test.assert_equals('replace_in_progress_keeps_authorized_status',
    (select authorization_status from public.consequences where id = v_consequence), 'authorized');
  perform test.assert_equals('replace_in_progress_keeps_old_reference',
    (select payment_method_reference from private.consequence_provider_references where consequence_id = v_consequence), 'pm_r1');

  select public.apply_consequence_setup_event('evt_r2_fail', 'setup_intent.setup_failed', 'seti_r2', 'cus_r', null, 'failed') into v_webhook;
  perform test.assert_equals('replace_failure_preserves_old_method',
    (select payment_method_reference from private.consequence_provider_references where consequence_id = v_consequence), 'pm_r1');
  perform test.assert_equals('replace_failure_keeps_authorized_status',
    (select authorization_status from public.consequences where id = v_consequence), 'authorized');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_r', 'seti_r3');
  select public.apply_consequence_setup_event('evt_r3', 'setup_intent.succeeded', 'seti_r3', 'cus_r', 'pm_r3', 'succeeded') into v_webhook;
  perform test.assert_equals('replace_success_switches_reference',
    (select payment_method_reference from private.consequence_provider_references where consequence_id = v_consequence), 'pm_r3');

  -- Late event for the very first (now long-superseded) attempt.
  select public.apply_consequence_setup_event('evt_r1_late', 'setup_intent.succeeded', 'seti_r1', 'cus_r', 'pm_r1', 'succeeded') into v_webhook;
  perform test.assert_equals('superseded_event_outcome', v_webhook ->> 'outcome', 'superseded');
  perform test.assert_equals('superseded_event_does_not_revert_reference',
    (select payment_method_reference from private.consequence_provider_references where consequence_id = v_consequence), 'pm_r3');
end;
$$;

-- Webhook after commitment cancellation cannot reauthorize it.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_webhook jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-cancel-guard@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');

  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_cg', 'seti_cg');
  update public.challenges set challenge_status = 'canceled_before_activation' where id = v_challenge;
  update public.consequences set status = 'canceled_before_activation' where id = v_consequence;

  select public.apply_consequence_setup_event('evt_cg', 'setup_intent.succeeded', 'seti_cg', 'cus_cg', 'pm_cg', 'succeeded') into v_webhook;
  perform test.assert_equals('cancel_guard_outcome', v_webhook ->> 'outcome', 'commitment_not_pending');
  perform test.assert_equals('cancel_guard_not_authorized', (select authorization_status from public.consequences where id = v_consequence), 'pending');
  perform test.assert_equals('cancel_guard_no_provider_reference',
    (select count(*) from private.consequence_provider_references where consequence_id = v_consequence), 0::bigint);
end;
$$;

-- A SetupIntent id this system never created is safely ignored (still
-- recorded as processed, for idempotency, but nothing else is touched).
select test.assert_equals(
  'unknown_setup_intent_outcome',
  (select public.apply_consequence_setup_event('evt_unknown', 'setup_intent.succeeded', 'seti_never_existed', 'cus_z', 'pm_z', 'succeeded') ->> 'outcome'),
  'unknown_setup_intent'
);

-- Defense in depth: a Stripe object whose customer does not match what was
-- recorded for this attempt is rejected rather than trusted blindly.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_challenge uuid := gen_random_uuid();
  v_consequence uuid := gen_random_uuid();
  v_webhook jsonb;
begin
  insert into auth.users (id, email) values (v_owner, 'setup-mismatch@example.test');
  insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (v_challenge, v_owner, 1, 1, 'pending_activation');
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (v_consequence, v_challenge, v_owner, 'payment_method_required', 7500, 'USD');
  perform public.record_consequence_setup_attempt(v_owner, v_challenge, 'cus_real', 'seti_mismatch');
  select public.apply_consequence_setup_event('evt_mismatch', 'setup_intent.succeeded', 'seti_mismatch', 'cus_WRONG', 'pm_x', 'succeeded') into v_webhook;
  perform test.assert_equals('mismatch_outcome', v_webhook ->> 'outcome', 'customer_mismatch');
  perform test.assert_equals('mismatch_no_authorization', (select authorization_status from public.consequences where id = v_consequence), 'pending');
end;
$$;

reset role;

-- anon/authenticated cannot read any private Stripe reference or setup
-- history table, and cannot call any of the three trusted RPCs — the same
-- schema-level isolation proven generically in 050_private_schema_isolation.sql,
-- re-asserted here directly against this package's own new tables/functions.
set role anon;
select test.assert_fails('anon_select_stripe_customers_denied', 'select count(*) from private.stripe_customers', '42501');
select test.assert_fails('anon_select_setup_attempts_denied', 'select count(*) from private.consequence_setup_attempts', '42501');
select test.assert_fails('anon_select_webhook_events_denied', 'select count(*) from private.stripe_webhook_events', '42501');
select test.assert_fails('anon_cannot_call_prepare', 'select public.prepare_consequence_setup(gen_random_uuid(), gen_random_uuid(), null)', '42501');
select test.assert_fails('anon_cannot_call_record', format('select public.record_consequence_setup_attempt(gen_random_uuid(), gen_random_uuid(), %L, %L)', 'x', 'y'), '42501');
select test.assert_fails('anon_cannot_call_apply_event', format('select public.apply_consequence_setup_event(%L,%L,%L,%L,%L,%L)', 'e', 't', 's', 'c', 'p', 'succeeded'), '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails('authenticated_select_stripe_customers_denied', 'select count(*) from private.stripe_customers', '42501');
select test.assert_fails('authenticated_select_setup_attempts_denied', 'select count(*) from private.consequence_setup_attempts', '42501');
select test.assert_fails('authenticated_select_webhook_events_denied', 'select count(*) from private.stripe_webhook_events', '42501');
select test.assert_fails('authenticated_cannot_call_prepare', 'select public.prepare_consequence_setup(gen_random_uuid(), gen_random_uuid(), null)', '42501');
select test.assert_fails('authenticated_cannot_call_record', format('select public.record_consequence_setup_attempt(gen_random_uuid(), gen_random_uuid(), %L, %L)', 'x', 'y'), '42501');
select test.assert_fails('authenticated_cannot_call_apply_event', format('select public.apply_consequence_setup_event(%L,%L,%L,%L,%L,%L)', 'e', 't', 's', 'c', 'p', 'succeeded'), '42501');
reset role;
