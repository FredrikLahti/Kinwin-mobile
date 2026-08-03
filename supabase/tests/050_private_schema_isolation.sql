-- No authenticated (or anon) client may reach the `private` schema at all,
-- regardless of ownership. All statements below are expected to fail.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select 'authenticated_select_provider_references' as test, count(*) from private.consequence_provider_references;
select 'authenticated_select_charge_attempts' as test, count(*) from private.consequence_charge_attempts;
select 'authenticated_select_reward_fulfillments' as test, count(*) from private.reward_fulfillments;
insert into private.consequence_charge_attempts (id, consequence_id, idempotency_key, attempt_number, status, amount_minor_units, currency, requested_at)
  values (gen_random_uuid(), 'ffffffff-0000-0000-0000-000000000001', 'idem-hack', 99, 'succeeded', 1, 'USD', now());

reset role;
set role anon;
select 'anon_select_provider_references' as test, count(*) from private.consequence_provider_references;
