set role service_role;
update public.invitations set invitation_status='ready', token_hash=encode(extensions.digest('opaque-token-a','sha256'),'hex'), token_issued_at=now()
where id='11111111-0000-0000-0000-000000000002';
select test.assert_equals('raw_recipient_token_is_not_stored',(select count(*) from public.invitations where token_hash like '%opaque-token-a%'),0::bigint);
select test.assert_equals('accepted_delivery_target_absent_before_acceptance',(select count(*) from private.accepted_recipient_delivery_targets where invitation_id='11111111-0000-0000-0000-000000000002'),0::bigint);
update public.invitations set invitation_status='accepted',sent_at=now(),responded_at=now() where id='11111111-0000-0000-0000-000000000002';
select test.assert_equals('accepted_recipient_identity_remains_linked',(select recipient_id from public.invitations where id='11111111-0000-0000-0000-000000000002'),'cccccccc-0000-0000-0000-000000000001'::uuid);
select test.assert_equals('future_delivery_lookup_is_deterministic',(select count(*) from private.accepted_recipient_delivery_targets where invitation_id='11111111-0000-0000-0000-000000000002' and consequence_id='ffffffff-0000-0000-0000-000000000001'),1::bigint);
select test.assert_equals('invitation_response_does_not_change_challenge',(select challenge_status from public.challenges where id='bbbbbbbb-0000-0000-0000-000000000001'),'completed_failure');
select test.assert_equals('invitation_response_does_not_change_consequence',(select stake_minor_units from public.consequences where id='ffffffff-0000-0000-0000-000000000001'),7500::bigint);
select test.assert_equals('invitation_response_does_not_create_kin',(select count(*) from public.kin_connections where requester_id='11111111-1111-1111-1111-111111111111' or recipient_id='11111111-1111-1111-1111-111111111111'),0::bigint);
reset role;

set role anon;
select test.assert_fails('anon_cannot_read_invitations','select * from public.invitations','42501');
select test.assert_fails('anon_cannot_read_challenges','select * from public.challenges','42501');
select test.assert_fails('anon_cannot_read_recipients','select * from public.challenge_recipients','42501');
select test.assert_fails('anon_cannot_read_consequences','select * from public.consequences','42501');
select test.assert_fails('anon_cannot_read_check_ins','select * from public.check_in_events','42501');
select test.assert_fails('anon_cannot_read_profiles','select * from public.profiles','42501');
reset role;

set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select test.assert_equals('foreign_owner_cannot_read_invitation_status',(select count(*) from public.invitations where id='11111111-0000-0000-0000-000000000002'),0::bigint);
reset role;
