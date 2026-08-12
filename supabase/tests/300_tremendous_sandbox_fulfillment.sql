set role service_role;
select test.assert_equals('paid_failure_waits_for_accepted_organizer',(select count(*) from private.reward_fulfillments f join public.consequences co on co.id=f.consequence_id where co.challenge_id='a2000000-0000-0000-0000-000000000001'),0::bigint);
insert into public.invitations(challenge_id,owner_id,recipient_id,invitation_status,token_hash,token_issued_at,sent_at,responded_at)
select o.challenge_id,c.owner_id,o.challenge_recipient_id,'declined',repeat('b',64),now(),now(),now() from public.challenge_reward_organizers o join public.challenges c on c.id=o.challenge_id where o.challenge_id='a2000000-0000-0000-0000-000000000001';
select test.assert_equals('declined_organizer_cannot_prepare_reward_link',(select public.prepare_accepted_organizer_reward_link((select id from public.invitations where challenge_id='a2000000-0000-0000-0000-000000000001')) is null),true);
create temporary table declined_start as select public.start_reward_fulfillment_worker() value;
select test.assert_equals('declined_organizer_is_not_eligible',(select count(*) from public.claim_due_reward_fulfillments((select (value->>'runId')::uuid from declined_start),(select (value->>'leaseToken')::uuid from declined_start),25)),0::bigint);
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from declined_start),(select (value->>'leaseToken')::uuid from declined_start),'succeeded',0,0,0,null);
update public.invitations set invitation_status='accepted' where challenge_id='a2000000-0000-0000-0000-000000000001';
create temporary table fulfillment_start as select public.start_reward_fulfillment_worker() value;
select test.assert_equals('concurrent_worker_cannot_claim_lease',(public.start_reward_fulfillment_worker()->>'status'),'already_running');
create temporary table fulfillment_claim as select * from public.claim_due_reward_fulfillments((select (value->>'runId')::uuid from fulfillment_start),(select (value->>'leaseToken')::uuid from fulfillment_start),25);
select test.assert_equals('one_paid_failed_consequence_creates_one_obligation',(select count(*) from fulfillment_claim),1::bigint);
select test.assert_equals('full_value_is_not_split',(select amount_minor_units||':'||currency from fulfillment_claim),'2500:USD');
select test.assert_equals('stable_internal_idempotency_key',(select idempotency_key from fulfillment_claim),'kinwin-reward:'||(select co.id from public.consequences co where co.challenge_id='a2000000-0000-0000-0000-000000000001'));
select test.assert_equals('recipient_group_is_context_not_allocation',(select recipient_names[1] from fulfillment_claim),'Test recipient');
select public.record_reward_fulfillment_result((select obligation_id from fulfillment_claim),(select (value->>'runId')::uuid from fulfillment_start),(select (value->>'leaseToken')::uuid from fulfillment_start),false,true,null,null,'provider_unavailable');
select test.assert_equals('temporary_provider_failure_keeps_payment_truth',(select status from public.consequences where challenge_id='a2000000-0000-0000-0000-000000000001'),'reward_fulfillment_pending');
select test.assert_equals('temporary_provider_failure_keeps_challenge_truth',(select challenge_status from public.challenges where id='a2000000-0000-0000-0000-000000000001'),'completed_failure');
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from fulfillment_start),(select (value->>'leaseToken')::uuid from fulfillment_start),'partial_failure',1,1,1,null);
update private.reward_fulfillments set next_retry_at=clock_timestamp() where id=(select obligation_id from fulfillment_claim);
create temporary table fulfillment_retry_start as select public.start_reward_fulfillment_worker() value;
create temporary table fulfillment_retry_claim as select * from public.claim_due_reward_fulfillments((select (value->>'runId')::uuid from fulfillment_retry_start),(select (value->>'leaseToken')::uuid from fulfillment_retry_start),25);
select test.assert_equals('retry_reuses_the_same_obligation',(select obligation_id from fulfillment_retry_claim),(select obligation_id from fulfillment_claim));
select test.assert_equals('retry_does_not_create_duplicate_provider_obligation',(select count(*) from private.reward_fulfillments f join public.consequences co on co.id=f.consequence_id where co.challenge_id='a2000000-0000-0000-0000-000000000001'),1::bigint);
select public.record_reward_fulfillment_result((select obligation_id from fulfillment_retry_claim),(select (value->>'runId')::uuid from fulfillment_retry_start),(select (value->>'leaseToken')::uuid from fulfillment_retry_start),true,false,'sandbox_order_1','sandbox_reward_1',null);
select test.assert_equals('provider_creation_is_not_delivery',(select status from public.consequences where challenge_id='a2000000-0000-0000-0000-000000000001'),'reward_fulfillment_pending');
select test.assert_equals('provider_creation_is_persisted_separately',(select status from private.reward_fulfillments where id=(select obligation_id from fulfillment_retry_claim)),'provider_created');
select test.assert_fails('provider_identity_cannot_change',$stmt$update private.reward_fulfillments set provider_order_id='redirected' where id=(select obligation_id from fulfillment_retry_claim)$stmt$,'23000');
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from fulfillment_retry_start),(select (value->>'leaseToken')::uuid from fulfillment_retry_start),'succeeded',1,1,0,null);

create temporary table reconciliation_start as select public.start_reward_fulfillment_worker() value;
create temporary table reconciliation_claim as select * from public.claim_due_reward_reconciliations((select (value->>'runId')::uuid from reconciliation_start),(select (value->>'leaseToken')::uuid from reconciliation_start),25);
select test.assert_equals('reconciliation_claims_existing_provider_reward',(select provider_reward_id from reconciliation_claim),'sandbox_reward_1');
select test.assert_equals('reconciliation_claims_expected_order_too',(select provider_order_id from reconciliation_claim),'sandbox_order_1');
select public.record_reward_reconciliation_result((select obligation_id from reconciliation_claim),(select (value->>'runId')::uuid from reconciliation_start),(select (value->>'leaseToken')::uuid from reconciliation_start),'processing','PENDING',false,null);
select test.assert_equals('provider_processing_remains_pending',(select status from public.consequences where challenge_id='a2000000-0000-0000-0000-000000000001'),'reward_fulfillment_pending');
select test.assert_equals('processing_projection_is_truthful',(public.get_accepted_organizer_reward_handoff((select id from public.invitations where challenge_id='a2000000-0000-0000-0000-000000000001'))->>'status'),'processing');
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from reconciliation_start),(select (value->>'leaseToken')::uuid from reconciliation_start),'succeeded',1,1,0,null);

update private.reward_fulfillments set reconciliation_next_retry_at=clock_timestamp() where id=(select obligation_id from fulfillment_claim);
create temporary table ready_start as select public.start_reward_fulfillment_worker() value;
create temporary table ready_claim as select * from public.claim_due_reward_reconciliations((select (value->>'runId')::uuid from ready_start),(select (value->>'leaseToken')::uuid from ready_start),25);
select test.assert_fails('delivered_requires_succeeded_status',$stmt$select public.record_reward_reconciliation_result((select obligation_id from ready_claim),(select (value->>'runId')::uuid from ready_start),(select (value->>'leaseToken')::uuid from ready_start),'ready','AVAILABLE',false,null)$stmt$,'22023');
select public.record_reward_reconciliation_result((select obligation_id from ready_claim),(select (value->>'runId')::uuid from ready_start),(select (value->>'leaseToken')::uuid from ready_start),'ready','SUCCEEDED',false,null);
select test.assert_equals('verified_ready_evidence_marks_reward_delivered',(select status from public.consequences where challenge_id='a2000000-0000-0000-0000-000000000001'),'reward_delivered');
select public.record_reward_reconciliation_result((select obligation_id from ready_claim),(select (value->>'runId')::uuid from ready_start),(select (value->>'leaseToken')::uuid from ready_start),'ready','SUCCEEDED',false,null);
select test.assert_equals('repeated_ready_is_idempotent',(select count(*) from private.reward_fulfillments where provider_reward_id='sandbox_reward_1' and status='delivered'),1::bigint);
select test.assert_equals('correct_organizer_server_lookup_resolves_reward_id',(public.prepare_accepted_organizer_reward_link((select id from public.invitations where challenge_id='a2000000-0000-0000-0000-000000000001'))->>'providerRewardId'),'sandbox_reward_1');
create temporary table first_link_access as select public.prepare_accepted_organizer_reward_link((select id from public.invitations where challenge_id='a2000000-0000-0000-0000-000000000001')) value;
-- The immediately preceding lookup reserves the cooldown, so the next request is rejected.
select test.assert_equals('rapid_reward_link_requests_are_cooled_down',(select value->>'outcome' from first_link_access),'cooldown');
update private.reward_fulfillments set reward_link_last_requested_at=clock_timestamp()-interval '31 seconds' where provider_reward_id='sandbox_reward_1';
create temporary table recovery_link_access as select public.prepare_accepted_organizer_reward_link((select id from public.invitations where challenge_id='a2000000-0000-0000-0000-000000000001')) value;
select test.assert_equals('later_reward_link_recovery_is_allowed',(select value->>'outcome' from recovery_link_access),'allowed');
select public.record_organizer_reward_link_result(((select value->>'accessEventId' from recovery_link_access))::uuid,true,null);
select test.assert_equals('successful_link_generation_is_audited_without_url',(select outcome from private.reward_link_access_events order by requested_at desc limit 1),'generated');
select test.assert_equals('audit_contains_no_link_column',(select count(*) from information_schema.columns where table_schema='private' and table_name='reward_link_access_events' and column_name like '%url%'),0::bigint);
select test.assert_equals('wrong_invitation_gets_no_reward',(select public.prepare_accepted_organizer_reward_link('11111111-0000-0000-0000-000000000002') is null),true);
select test.assert_equals('reward_link_is_not_durable',(select count(*) from information_schema.columns where table_schema='private' and table_name='reward_fulfillments' and column_name='redemption_url'),0::bigint);
create temporary table organizer_before_rotation as select o.id organizer_id,f.id fulfillment_id,f.provider_order_id,f.provider_reward_id,i.token_hash old_hash,i.id invitation_id
 from public.challenge_reward_organizers o join public.invitations i on i.organizer_id=o.id or i.recipient_id=o.challenge_recipient_id
 join private.reward_fulfillments f on f.organizer_id=o.id where o.challenge_id='a2000000-0000-0000-0000-000000000001';
update public.invitations set token_hash=repeat('d',64),token_issued_at=clock_timestamp() where id=(select invitation_id from organizer_before_rotation);
select test.assert_equals('rotation_invalidates_old_token_hash',(select count(*) from public.invitations where token_hash=(select old_hash from organizer_before_rotation)),0::bigint);
select test.assert_equals('rotation_preserves_accepted_state',(select invitation_status from public.invitations where id=(select invitation_id from organizer_before_rotation)),'accepted');
select test.assert_equals('rotation_preserves_canonical_organizer',(select organizer_id from private.reward_fulfillments where id=(select fulfillment_id from organizer_before_rotation)),(select organizer_id from organizer_before_rotation));
select test.assert_equals('rotation_preserves_provider_identity',(select provider_order_id||':'||provider_reward_id from private.reward_fulfillments where id=(select fulfillment_id from organizer_before_rotation)),(select provider_order_id||':'||provider_reward_id from organizer_before_rotation));
insert into public.challenge_recipients(id,challenge_id,display_name,sort_order) values('30000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','Ordinary recipient',1);
insert into public.invitations(challenge_id,owner_id,recipient_id,invitation_status,token_hash,token_issued_at,sent_at,responded_at) values('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','accepted',repeat('c',64),now(),now(),now());
select test.assert_equals('ordinary_recipient_cannot_prepare_organizer_link',(select public.prepare_accepted_organizer_reward_link((select id from public.invitations where recipient_id='30000000-0000-0000-0000-000000000003')) is null),true);
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from ready_start),(select (value->>'leaseToken')::uuid from ready_start),'succeeded',1,1,0,null);

-- A second fixture proves both retryable and terminal reconciliation failures
-- leave the already-final challenge and succeeded payment unchanged.
update public.challenges set challenge_status='completed_failure',completed_at=now() where id='29222222-0000-0000-0000-000000000001';
update public.consequences set status='reward_fulfillment_pending' where id='29444444-0000-0000-0000-000000000001';
update public.invitations set invitation_status='accepted' where organizer_id=(select id from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001');
insert into private.consequence_charge_attempts(id,consequence_id,owner_id,idempotency_key,attempt_number,status,amount_minor_units,currency,stripe_customer_id,stripe_payment_method_id,stripe_payment_intent_id,requested_at,completed_at)
values('30000000-0000-0000-0000-000000000001','29444444-0000-0000-0000-000000000001','29111111-0000-0000-0000-000000000001','terminal-fixture',1,'succeeded',5000,'USD','cus_terminal','pm_terminal','pi_terminal',now(),now());
insert into private.reward_fulfillments(id,consequence_id,organizer_id,invitation_id,idempotency_key,fulfillment_provider,status,amount_minor_units,currency,requested_at,provider_order_id,provider_reward_id,provider_created_at,reconciliation_next_retry_at)
select '30000000-0000-0000-0000-000000000002',co.id,o.id,i.id,'terminal-reward-fixture','tremendous_sandbox','provider_created',co.stake_minor_units,co.currency,now(),'sandbox_order_terminal','sandbox_reward_terminal',now(),now()
from public.consequences co join public.challenge_reward_organizers o on o.challenge_id=co.challenge_id join public.invitations i on i.organizer_id=o.id where co.id='29444444-0000-0000-0000-000000000001';
update private.reward_fulfillments set status='reconciling',reconciliation_attempt_count=1,last_reconciled_at=clock_timestamp()-interval '26 minutes',reconciliation_next_retry_at=null where id='30000000-0000-0000-0000-000000000002';
create temporary table retryable_reconcile_start as select public.start_reward_fulfillment_worker() value;
select test.assert_equals('stale_reconciliation_is_reclaimed',(select status from private.reward_fulfillments where id='30000000-0000-0000-0000-000000000002'),'reconciliation_retry');
create temporary table retryable_reconcile_claim as select * from public.claim_due_reward_reconciliations((select (value->>'runId')::uuid from retryable_reconcile_start),(select (value->>'leaseToken')::uuid from retryable_reconcile_start),25);
select public.record_reward_reconciliation_result('30000000-0000-0000-0000-000000000002',(select (value->>'runId')::uuid from retryable_reconcile_start),(select (value->>'leaseToken')::uuid from retryable_reconcile_start),'failure',null,true,'http_503');
select test.assert_equals('reconciliation_temporary_failure_is_retryable',(select status from private.reward_fulfillments where id='30000000-0000-0000-0000-000000000002'),'reconciliation_retry');
select test.assert_equals('reconciliation_failure_keeps_payment_succeeded',(select status from private.consequence_charge_attempts where id='30000000-0000-0000-0000-000000000001'),'succeeded');
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from retryable_reconcile_start),(select (value->>'leaseToken')::uuid from retryable_reconcile_start),'partial_failure',1,1,1,null);
update private.reward_fulfillments set reconciliation_next_retry_at=now() where id='30000000-0000-0000-0000-000000000002';
create temporary table terminal_reconcile_start as select public.start_reward_fulfillment_worker() value;
create temporary table terminal_reconcile_claim as select * from public.claim_due_reward_reconciliations((select (value->>'runId')::uuid from terminal_reconcile_start),(select (value->>'leaseToken')::uuid from terminal_reconcile_start),25);
select public.record_reward_reconciliation_result('30000000-0000-0000-0000-000000000002',(select (value->>'runId')::uuid from terminal_reconcile_start),(select (value->>'leaseToken')::uuid from terminal_reconcile_start),'failure',null,false,'unknown_provider_reward');
select test.assert_equals('terminal_provider_failure_needs_support',(select status from private.reward_fulfillments where id='30000000-0000-0000-0000-000000000002'),'terminal_failure');
select test.assert_equals('terminal_provider_failure_keeps_consequence_pending',(select status from public.consequences where id='29444444-0000-0000-0000-000000000001'),'reward_fulfillment_pending');
select test.assert_equals('terminal_provider_failure_keeps_challenge_failure',(select challenge_status from public.challenges where id='29222222-0000-0000-0000-000000000001'),'completed_failure');
select public.finish_reward_fulfillment_worker((select (value->>'runId')::uuid from terminal_reconcile_start),(select (value->>'leaseToken')::uuid from terminal_reconcile_start),'partial_failure',1,1,1,null);
select test.assert_equals('successful_challenge_has_no_fulfillment',(select count(*) from private.reward_fulfillments f join public.consequences co on co.id=f.consequence_id where co.challenge_id='a2000000-0000-0000-0000-000000000002'),0::bigint);
select test.assert_equals('authenticated_cannot_start_fulfillment_worker',has_function_privilege('authenticated','public.start_reward_fulfillment_worker()','execute'),false);
select test.assert_equals('authenticated_cannot_claim_reconciliation',has_function_privilege('authenticated','public.claim_due_reward_reconciliations(uuid,uuid,integer)','execute'),false);
select test.assert_equals('service_role_can_read_fulfillment_health',has_table_privilege('service_role','private.reward_fulfillment_health','select'),true);
select test.assert_equals('operations_view_has_no_secret_columns',(select count(*) from information_schema.columns where table_schema='private' and table_name='reward_fulfillment_health' and (column_name like '%token%' or column_name like '%url%' or column_name like '%key%')),0::bigint);
reset role;
set role authenticated;
select test.assert_fails('owner_cannot_read_private_fulfillment','select * from private.reward_fulfillments','42501');
select test.assert_fails('owner_cannot_read_fulfillment_health','select * from private.reward_fulfillment_health','42501');
reset role;
set role anon;
select test.assert_fails('anon_cannot_read_private_fulfillment','select * from private.reward_fulfillments','42501');
select test.assert_fails('anon_cannot_read_fulfillment_health','select * from private.reward_fulfillment_health','42501');
reset role;
