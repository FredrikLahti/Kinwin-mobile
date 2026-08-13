set role service_role;
create or replace function pg_temp.seed_recovery_case(p_suffix int,p_attempt_status text) returns uuid language plpgsql as $$
declare o uuid:=('a5000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;c uuid:=('a6000000-0000-0000-0000-'||lpad(p_suffix::text,12,'0'))::uuid;co uuid;
begin
 insert into auth.users(id,email) values(o,'recovery-'||p_suffix||'@test.invalid');
 insert into public.challenges(
   id,owner_id,schema_version,rule_engine_version,challenge_status,timezone,
   activated_at,starts_at,planned_ends_at,completed_at,activation_snapshot
 ) values (
   c,o,1,1,'completed_failure','Europe/Stockholm',now()-interval '15 days',
   now()-interval '14 days',now()-interval '1 day',now(),
   jsonb_build_object(
     'id',c::text,'ownerId',o::text,'schemaVersion',1,'ruleEngineVersion',1,
     'goal','Recovery fixture',
     'behavior',jsonb_build_object('description','Read daily','completionDefinition','Read once'),
     'duration',jsonb_build_object('unit','week','value',2),
     'successRule',jsonb_build_object('direction','build','ruleVersion',1),
     'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Test recipient')),
     'rewardOrganizer',jsonb_build_object('type','recipient','recipientId','r1'),
     'consequenceCategory','wellness','stake',jsonb_build_object('minorUnits',2500,'currency','USD'),
     'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing'
   )
 );
 insert into public.consequences(challenge_id,owner_id,status,stake_minor_units,currency,authorization_status,authorized_at) values(c,o,'active',2500,'USD','authorized',now()) returning id into co;
 insert into private.stripe_customers(owner_id,stripe_customer_id) values(o,'cus_recovery_'||p_suffix);
 insert into private.consequence_provider_references(consequence_id,payment_provider,customer_reference,payment_method_reference,authorization_reference) values(co,'stripe','cus_recovery_'||p_suffix,'pm_recovery_'||p_suffix,'seti_recovery_'||p_suffix);
 if p_attempt_status is not null then
   insert into private.consequence_charge_attempts(consequence_id,owner_id,idempotency_key,attempt_number,status,
     amount_minor_units,currency,stripe_customer_id,stripe_payment_method_id,retry_count,customer_action_required,requested_at)
   values(co,o,'kinwin-failure-obligation:'||c,1,p_attempt_status,2500,'USD','cus_recovery_'||p_suffix,'pm_recovery_'||p_suffix,
     case when p_attempt_status='permanently_failed' then 3 else 0 end,(p_attempt_status='requires_action'),now());
 end if;
 return c;
end $$;

select pg_temp.seed_recovery_case(1,null);
select pg_temp.seed_recovery_case(2,'requires_payment_method');
select pg_temp.seed_recovery_case(3,'permanently_failed');
select pg_temp.seed_recovery_case(4,'succeeded');
select pg_temp.seed_recovery_case(5,'temporary_failure');
select pg_temp.seed_recovery_case(6,'requires_action');
reset role;

-- get_owner_payment_status: owner-scoped, coarse states only.
set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000001',false);
select test.assert_equals('no_attempt_row_is_not_applicable',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000001')->>'state'),'not_applicable');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000002',false);
select test.assert_equals('requires_payment_method_needs_attention',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000002')->>'state'),'needs_attention');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000003',false);
select test.assert_equals('permanently_failed_needs_attention',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000003')->>'state'),'needs_attention');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000004',false);
select test.assert_equals('succeeded_is_paid',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000004')->>'state'),'paid');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000005',false);
select test.assert_equals('temporary_failure_is_processing',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000005')->>'state'),'processing');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-0000-0000-000000000003',false);
select test.assert_equals('foreign_owner_gets_not_applicable',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000002')->>'state'),'not_applicable');
select test.assert_equals('projection_has_no_provider_identity',(public.get_owner_payment_status('a6000000-0000-0000-0000-000000000003') ? 'stripePaymentIntentId'),false);
reset role;

-- prepare_consequence_recovery_setup now accepts a permanently_failed obligation.
set role service_role;
select test.assert_equals('recovery_setup_accepts_permanently_failed',
  (public.prepare_consequence_recovery_setup('a5000000-0000-0000-0000-000000000003','a6000000-0000-0000-0000-000000000003')->>'challengeId'),
  'a6000000-0000-0000-0000-000000000003');
select test.assert_fails('recovery_setup_rejects_temporary_failure',
  $$select public.prepare_consequence_recovery_setup('a5000000-0000-0000-0000-000000000005'::uuid,'a6000000-0000-0000-0000-000000000005'::uuid)$$,
  '22023');
reset role;

-- claim_due_consequence_payments revives a replaced-card permanently_failed
-- obligation with retry_count reset, so it becomes claimable again.
set role service_role;
update private.consequence_provider_references set payment_method_reference='pm_recovery_3_replaced' where consequence_id=(select id from public.consequences where challenge_id='a6000000-0000-0000-0000-000000000003');
create temporary table recovery_worker_start as select public.start_consequence_payment_worker() value;
create temporary table recovery_claimed as select * from public.claim_due_consequence_payments((select (value->>'runId')::uuid from recovery_worker_start),(select (value->>'leaseToken')::uuid from recovery_worker_start),25);
select test.assert_equals('replaced_card_revives_permanently_failed_obligation',(
  select a.status from private.consequence_charge_attempts a join public.consequences co on co.id=a.consequence_id where co.challenge_id='a6000000-0000-0000-0000-000000000003'
),'processing');
select test.assert_equals('revived_obligation_retry_count_reset_then_reclaimed',(
  select a.retry_count from private.consequence_charge_attempts a join public.consequences co on co.id=a.consequence_id where co.challenge_id='a6000000-0000-0000-0000-000000000003'
),1);
reset role;
