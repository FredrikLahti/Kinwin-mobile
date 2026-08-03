-- No authenticated (or anon) client may reach the `private` schema at all,
-- regardless of ownership. Every statement below is machine-asserted to fail
-- with SQLSTATE 42501 (insufficient_privilege) — schema-level USAGE is not
-- granted to either role, so this fails before any table-level check.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select test.assert_fails('authenticated_select_provider_references_denied', 'select count(*) from private.consequence_provider_references', '42501');
select test.assert_fails('authenticated_select_charge_attempts_denied', 'select count(*) from private.consequence_charge_attempts', '42501');
select test.assert_fails('authenticated_select_reward_fulfillments_denied', 'select count(*) from private.reward_fulfillments', '42501');
select test.assert_fails(
  'authenticated_insert_charge_attempt_denied',
  $stmt$insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
    values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-hack', 99, 'succeeded', 1, 'USD', now())$stmt$,
  '42501'
);

reset role;
set role anon;
select test.assert_fails('anon_select_provider_references_denied', 'select count(*) from private.consequence_provider_references', '42501');
