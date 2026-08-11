set role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false);
select test.assert_equals('owner_reward_ready_is_safe_product_state',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001')->>'state'),'ready');
select test.assert_equals('owner_reward_projection_names_organizer',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001')->>'organizerName'),(select display_name from public.challenge_reward_organizers where challenge_id='a2000000-0000-0000-0000-000000000001'));
select test.assert_equals('owner_reward_projection_has_no_provider_identity',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001') ? 'providerRewardId'),false);
select test.assert_equals('foreign_owner_gets_no_reward_progress',(public.get_owner_reward_progress('29222222-0000-0000-0000-000000000001') is null),true);
reset role;

set role service_role;
update public.invitations set invitation_status='sent' where challenge_id='a2000000-0000-0000-0000-000000000001' and token_hash=repeat('d',64);
set role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false);
select test.assert_equals('unaccepted_organizer_maps_to_waiting',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001')->>'state'),'waiting_for_organizer');
reset role;

set role service_role;
update public.invitations set invitation_status='accepted' where challenge_id='a2000000-0000-0000-0000-000000000001' and token_hash=repeat('d',64);
update public.consequences set status='reward_fulfillment_pending' where challenge_id='a2000000-0000-0000-0000-000000000001';
update private.reward_fulfillments set status='provider_created',provider_status='PENDING',delivered_at=null where provider_reward_id='sandbox_reward_1';
set role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false);
select test.assert_equals('accepted_pending_reward_maps_to_preparing',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001')->>'state'),'preparing');
reset role;

set role service_role;
update private.reward_fulfillments set status='terminal_failure',provider_status='FAILED' where provider_reward_id='sandbox_reward_1';
set role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false);
select test.assert_equals('terminal_reward_maps_to_needs_attention',(public.get_owner_reward_progress('a2000000-0000-0000-0000-000000000001')->>'state'),'needs_attention');
reset role;
