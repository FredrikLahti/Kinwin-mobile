set role service_role;
create or replace function pg_temp.seed_payment_case(p_suffix int,p_status text) returns uuid language plpgsql as $$
declare o uuid:=('a1000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;c uuid:=('a2000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;co uuid;
begin
 insert into auth.users(id,email) values(o,'payment-'||p_suffix||'@test.invalid');
 insert into public.challenges(id,owner_id,schema_version,rule_engine_version,challenge_status) values(c,o,1,1,p_status);
 insert into public.consequences(challenge_id,owner_id,status,stake_minor_units,currency,authorization_status,authorized_at) values(c,o,'active',2500,'USD','authorized',now()) returning id into co;
 insert into private.stripe_customers(owner_id,stripe_customer_id) values(o,'cus_payment_'||p_suffix);
 insert into private.consequence_provider_references(consequence_id,payment_provider,customer_reference,payment_method_reference,authorization_reference) values(co,'stripe','cus_payment_'||p_suffix,'pm_payment_'||p_suffix,'seti_payment_'||p_suffix);
 return c;
end $$;
select pg_temp.seed_payment_case(1,'completed_failure');
select pg_temp.seed_payment_case(2,'completed_success');
select pg_temp.seed_payment_case(3,'active');
select pg_temp.seed_payment_case(4,'awaiting_resolution');
select pg_temp.seed_payment_case(5,'superseded');
select pg_temp.seed_payment_case(6,'completion_mode');

create temporary table worker_start as select public.start_consequence_payment_worker() value;
create temporary table claimed as select * from public.claim_due_consequence_payments((select (value->>'runId')::uuid from worker_start),(select (value->>'leaseToken')::uuid from worker_start),25);
select test.assert_equals('only_completed_failure_creates_obligation',(select count(*) from private.consequence_charge_attempts),1::bigint);
select test.assert_equals('amount_and_currency_are_locked_from_consequence',(select amount_minor_units||':'||currency from private.consequence_charge_attempts),'2500:USD');
select test.assert_equals('completed_failure_is_claimed',(select count(*) from claimed),1::bigint);

select public.record_consequence_payment_intent((select obligation_id from claimed),(select (value->>'runId')::uuid from worker_start),(select (value->>'leaseToken')::uuid from worker_start),'pi_payment_1','processing',null);
select public.apply_consequence_payment_event('evt_paid_1','payment_intent.succeeded','pi_payment_1','cus_payment_1','succeeded',null);
select test.assert_equals('verified_success_marks_paid_once',(select status from private.consequence_charge_attempts),'succeeded');
select test.assert_equals('paid_is_ready_for_future_reward',(select status from public.consequences where challenge_id='a2000000-0000-0000-0000-000000000001'),'reward_fulfillment_pending');
select test.assert_equals('challenge_truth_is_unchanged',(select challenge_status from public.challenges where id='a2000000-0000-0000-0000-000000000001'),'completed_failure');
select public.apply_consequence_payment_event('evt_paid_1','payment_intent.succeeded','pi_payment_1','cus_payment_1','succeeded',null);
select test.assert_equals('duplicate_webhook_is_harmless',(select count(*) from private.stripe_webhook_events where stripe_event_id='evt_paid_1'),1::bigint);
select test.assert_equals('no_reward_fulfillment_is_created',(select count(*) from private.reward_fulfillments),0::bigint);
select test.assert_false('authenticated_cannot_claim_payments',has_function_privilege('authenticated','public.claim_due_consequence_payments(uuid,uuid,integer)','execute'));
