-- Exercises representative valid and invalid records against the migration's
-- CHECK constraints, as the trusted service_role. Every "invalid_*" statement
-- is expected to fail; every "valid_*" statement is expected to succeed.
set role service_role;

-- challenge_status: rejects an unlisted status.
insert into public.challenges (id, owner_id, schema_version, rule_engine_version, challenge_status)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 1, 1, 'invalid_status_value');

-- membership access_mode: rejects an unlisted mode.
insert into public.memberships (id, owner_id, membership_status, access_mode)
  values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'trialing', 'super_admin');

-- recipients: sort_order out of the 0-3 range is rejected.
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Fifth Recipient', 4);

-- recipients: a second recipient at an already-used sort_order for the same challenge is rejected.
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Duplicate Slot', 0);

-- recipients: valid distinct sort_order succeeds.
insert into public.challenge_recipients (id, challenge_id, display_name, sort_order)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 'Second Recipient', 1);
select 'valid_recipient_inserted' as test, count(*) as rows_seen from public.challenge_recipients where challenge_id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- periods: ends_at not after starts_at is rejected.
insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 2, 'day', now(), now(), jsonb_build_object('type', 'completion_target', 'target', 1));

-- periods: period_number <= 0 is rejected.
insert into public.challenge_periods (id, challenge_id, period_number, period_kind, starts_at, ends_at, target_payload)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 0, 'day', now(), now() + interval '1 day', jsonb_build_object('type', 'completion_target', 'target', 1));

-- check-in events: an unlisted event_type is rejected.
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'made_up_event', jsonb_build_object('x', 1), 'ios', now());

-- check-in events: a 'correction' row without correction_of_event_id is rejected.
insert into public.check_in_events (id, challenge_id, owner_id, period_id, event_type, event_payload, source, client_recorded_at)
  values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'correction', jsonb_build_object('note', 'missing target'), 'ios', now());

-- consequences: a non-USD currency is rejected.
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
  values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'draft', 5000, 'EUR');

-- consequences: a non-positive stake is rejected.
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
  values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'draft', 0, 'USD');

-- consequences: an unlisted status is rejected.
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency)
  values (gen_random_uuid(), '99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'refunded_to_customer', 5000, 'USD');

-- charge attempts: a non-positive amount is rejected.
insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-bad-amount', 2, 'pending', 0, 'USD', now());

-- charge attempts: a duplicate idempotency_key for the same consequence is rejected.
insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-1', 2, 'pending', 7500, 'USD', now());

-- charge attempts: a second, distinct attempt succeeds.
insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-2', 2, 'pending', 7500, 'USD', now());
select 'valid_second_charge_attempt' as test, count(*) as rows_seen from private.consequence_charge_attempts where consequence_id = 'ffffffff-0000-0000-0000-000000000001';

-- reward fulfillments: status='delivered' without delivered_at is rejected.
insert into private.reward_fulfillments (id, consequence_id, fulfillment_provider, status, amount_minor_units, currency, requested_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'tremendous', 'delivered', 7500, 'USD', now());

-- reward fulfillments: status='delivered' with delivered_at succeeds.
insert into private.reward_fulfillments (id, consequence_id, fulfillment_provider, status, amount_minor_units, currency, requested_at, delivered_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'tremendous', 'delivered', 7500, 'USD', now(), now());
select 'valid_delivered_fulfillment' as test, count(*) as rows_seen from private.reward_fulfillments where status = 'delivered';
