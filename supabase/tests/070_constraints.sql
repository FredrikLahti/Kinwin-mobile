-- Exercises representative valid and invalid records against the migration's
-- CHECK/UNIQUE constraints, as the trusted service_role. Every "*_denied"
-- assertion checks the precise SQLSTATE (23514 check_violation, 23505
-- unique_violation) so an unrelated failure cannot masquerade as the
-- expected one; every "valid_*" case asserts the resulting row count.
set role service_role;

select test.assert_fails(
  'invalid_challenge_status_denied',
  $stmt$insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1, 1, 'invalid_status_value')$stmt$,
  '23514'
);

select test.assert_fails(
  'invalid_access_mode_denied',
  $stmt$insert into public.memberships (id, owner_id, membership_status, access_mode)
    values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'trialing', 'super_admin')$stmt$,
  '23514'
);

select test.assert_fails(
  'recipient_sort_order_out_of_range_denied',
  $stmt$insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Fifth Recipient', 4)$stmt$,
  '23514'
);

select test.assert_fails(
  'recipient_duplicate_sort_order_denied',
  $stmt$insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Duplicate Slot', 0)$stmt$,
  '23505'
);

do $$
declare
  recipient_count bigint;
begin
  insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Second Recipient', 1);
  select count(*) into recipient_count from public.challenge_recipients where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  perform test.assert_equals('valid_recipient_inserted', recipient_count, 2::bigint);
end;
$$;

select test.assert_fails(
  'period_ends_not_after_starts_denied',
  $stmt$insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 2, 'day', now(), now(), now() + interval '2 days', jsonb_build_object('type', 'completion_target', 'target', 1))$stmt$,
  '23514'
);

select test.assert_fails(
  'period_number_non_positive_denied',
  $stmt$insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 0, 'day', now(), now() + interval '1 day', now() + interval '2 days', jsonb_build_object('type', 'completion_target', 'target', 1))$stmt$,
  '23514'
);

-- 20260811000000_full_activation.sql's added constraint: the reporting
-- deadline must be strictly after tracking ends, not merely present.
select test.assert_fails(
  'period_reporting_closes_not_after_ends_denied',
  $stmt$insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 3, 'day', now(), now() + interval '1 day', now() + interval '1 day', jsonb_build_object('type', 'completion_target', 'target', 1))$stmt$,
  '23514'
);

select test.assert_fails(
  'checkin_invalid_event_type_denied',
  $stmt$insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'made_up_event', jsonb_build_object('x', 1), 'ios', now())$stmt$,
  '23514'
);

select test.assert_fails(
  'correction_without_target_denied',
  $stmt$insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'correction', jsonb_build_object('note', 'missing target'), 'ios', now())$stmt$,
  '23514'
);

select test.assert_fails(
  'consequence_non_usd_currency_denied',
  $stmt$insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'draft', 5000, 'EUR')$stmt$,
  '23514'
);

select test.assert_fails(
  'consequence_non_positive_stake_denied',
  $stmt$insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'draft', 0, 'USD')$stmt$,
  '23514'
);

select test.assert_fails(
  'consequence_invalid_status_denied',
  $stmt$insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
    values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'refunded_to_customer', 5000, 'USD')$stmt$,
  '23514'
);

select test.assert_fails(
  'charge_attempt_non_positive_amount_denied',
  $stmt$insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-bad-amount', 2, 'pending', 0, 'USD', now())$stmt$,
  '23514'
);

select test.assert_fails(
  'charge_attempt_duplicate_idempotency_key_denied',
  $stmt$insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-1', 2, 'pending', 7500, 'USD', now())$stmt$,
  '23505'
);

do $$
declare
  attempt_count bigint;
begin
  insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-2', 2, 'pending', 7500, 'USD', now());
  select count(*) into attempt_count from private.consequence_charge_attempts where consequence_id = 'ffffffff-0000-0000-0000-000000000001';
  perform test.assert_equals('valid_second_charge_attempt', attempt_count, 2::bigint);
end;
$$;

select test.assert_fails(
  'fulfillment_delivered_without_timestamp_denied',
  $stmt$insert into private.reward_fulfillments (id, consequence_id, fulfillment_provider, status, amount_minor_units, currency, requested_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'tremendous', 'delivered', 7500, 'USD', now())$stmt$,
  '23514'
);

do $$
declare
  delivered_count bigint;
begin
  insert into private.reward_fulfillments (id, consequence_id, fulfillment_provider, status, amount_minor_units, currency, requested_at, delivered_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'tremendous', 'delivered', 7500, 'USD', now(), now());
  select count(*) into delivered_count from private.reward_fulfillments where status = 'delivered';
  perform test.assert_equals('valid_delivered_fulfillment', delivered_count, 1::bigint);
end;
$$;
