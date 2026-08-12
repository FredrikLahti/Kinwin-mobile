set role service_role;
select test.assert_equals('seed_recipient_organizer_is_canonical',
  (select organizer_kind||':'||challenge_recipient_id::text from public.challenge_reward_organizers where challenge_id='bbbbbbbb-0000-0000-0000-000000000001'),
  'recipient:cccccccc-0000-0000-0000-000000000001');
select test.assert_equals('exactly_one_canonical_organizer_per_challenge',(select count(*) from public.challenge_reward_organizers where challenge_id='bbbbbbbb-0000-0000-0000-000000000001'),1::bigint);
select test.assert_equals('recipient_organizer_reuses_recipient_invitation',(select invitation_id from private.accepted_reward_organizer_targets where challenge_id='bbbbbbbb-0000-0000-0000-000000000001'),'11111111-0000-0000-0000-000000000002'::uuid);
select test.assert_fails('second_canonical_organizer_is_rejected',$stmt$insert into public.challenge_reward_organizers(challenge_id,owner_id,organizer_kind,display_name,challenge_recipient_id) values('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','recipient','Anna','cccccccc-0000-0000-0000-000000000001')$stmt$,'23505');
select test.assert_fails('canonical_organizer_cannot_be_redirected',$stmt$update public.challenge_reward_organizers set display_name='Redirected' where challenge_id='bbbbbbbb-0000-0000-0000-000000000001'$stmt$,'23000');

insert into auth.users(id,email) values('29111111-0000-0000-0000-000000000001','organizer-other@test.invalid');
insert into public.challenges(id,owner_id,schema_version,rule_engine_version,challenge_status) values('29222222-0000-0000-0000-000000000002','29111111-0000-0000-0000-000000000001',1,1,'pending_activation');
select test.assert_fails('linked_recipient_must_belong_to_same_challenge',$stmt$insert into public.challenge_reward_organizers(challenge_id,owner_id,organizer_kind,display_name,challenge_recipient_id) values('29222222-0000-0000-0000-000000000002','29111111-0000-0000-0000-000000000001','recipient','Wrong challenge','cccccccc-0000-0000-0000-000000000001')$stmt$,'23503');
insert into public.challenges(id,owner_id,schema_version,rule_engine_version,challenge_status,timezone,activated_at,starts_at,planned_ends_at,activation_snapshot)
values('29222222-0000-0000-0000-000000000001','29111111-0000-0000-0000-000000000001',1,1,'active','UTC',now(),now(),now()+interval '1 day',jsonb_build_object('schemaVersion',1,'id','29222222-0000-0000-0000-000000000001','ownerId','29111111-0000-0000-0000-000000000001','ruleEngineVersion',1,'goal','A goal','behavior',jsonb_build_object('description','Read','completionDefinition','Read'),'duration',jsonb_build_object('unit','week','value',1),'successRule',jsonb_build_object('direction','stop','ruleVersion',1),'recipients',jsonb_build_array(jsonb_build_object('id','r1','name','Beneficiary')),'rewardOrganizer',jsonb_build_object('type','other','name','Trusted Alex'),'consequenceCategory','dinner','stake',jsonb_build_object('minorUnits',5000,'currency','USD'),'sitOutAcknowledged',true,'membershipStatusAtActivation','trialing'));
insert into public.challenge_recipients(id,challenge_id,display_name,sort_order) values('29333333-0000-0000-0000-000000000001','29222222-0000-0000-0000-000000000001','Beneficiary',0);
insert into public.consequences(id,challenge_id,owner_id,status,stake_minor_units,currency) values('29444444-0000-0000-0000-000000000001','29222222-0000-0000-0000-000000000001','29111111-0000-0000-0000-000000000001','active',5000,'USD');
select test.assert_equals('other_organizer_gets_distinct_identity',(select organizer_kind||':'||display_name from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001'),'other:Trusted Alex');
select test.assert_true('other_organizer_is_not_a_beneficiary',(select challenge_recipient_id is null from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001'));
insert into public.invitations(challenge_id,owner_id,organizer_id,invitation_status,token_hash,token_issued_at,sent_at,responded_at) select challenge_id,owner_id,id,'accepted',repeat('a',64),now(),now(),now() from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001';
select test.assert_equals('accepted_other_organizer_is_future_target',(select organizer_id from private.accepted_reward_organizer_targets where challenge_id='29222222-0000-0000-0000-000000000001'),(select id from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001'));
update public.invitations set invitation_status='declined' where organizer_id=(select id from public.challenge_reward_organizers where challenge_id='29222222-0000-0000-0000-000000000001');
select test.assert_equals('declined_organizer_is_not_future_target',(select count(*) from private.accepted_reward_organizer_targets where challenge_id='29222222-0000-0000-0000-000000000001'),0::bigint);
reset role;

set role anon;
select test.assert_fails('anon_cannot_read_canonical_organizers','select * from public.challenge_reward_organizers','42501');
select test.assert_fails('private_organizer_targets_are_not_public','select * from private.accepted_reward_organizer_targets','42501');
reset role;
