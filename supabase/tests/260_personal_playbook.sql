set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

insert into public.playbook_entries(id,owner_id,category,content,source_challenge_id) values
 ('26000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','trigger','Late meetings make evenings harder.','bbbbbbbb-0000-0000-0000-000000000001');
select test.assert_equals('owner_creates_playbook_entry',(select count(*) from public.playbook_entries),1::bigint);

update public.playbook_entries set category='replacement',content='Prepare dinner before a late meeting.' where id='26000000-0000-0000-0000-000000000001';
select test.assert_equals('owner_edits_playbook_entry',(select category||':'||content from public.playbook_entries),'replacement:Prepare dinner before a late meeting.');

update public.playbook_entries set archived_at=now() where id='26000000-0000-0000-0000-000000000001';
select test.assert_true('owner_archives_playbook_entry',(select archived_at is not null from public.playbook_entries));

select test.assert_fails('invalid_playbook_category_denied',$stmt$insert into public.playbook_entries(owner_id,category,content) values('11111111-1111-1111-1111-111111111111','mood','Not a supported category')$stmt$,'23514');
select test.assert_fails('empty_playbook_content_denied',$stmt$insert into public.playbook_entries(owner_id,category,content) values('11111111-1111-1111-1111-111111111111','lesson','   ')$stmt$,'23514');
select test.assert_fails('source_challenge_must_belong_to_owner',$stmt$insert into public.playbook_entries(owner_id,category,content,source_challenge_id) values('22222222-2222-2222-2222-222222222222','lesson','Foreign source','bbbbbbbb-0000-0000-0000-000000000001')$stmt$,'42501');

reset role;set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select test.assert_equals('other_owner_cannot_read_playbook',(select count(*) from public.playbook_entries),0::bigint);
update public.playbook_entries set content='Tampered' where id='26000000-0000-0000-0000-000000000001';
select test.assert_equals('other_owner_cannot_update_playbook',current_setting('request.jwt.claim.sub'), '22222222-2222-2222-2222-222222222222');
delete from public.playbook_entries where id='26000000-0000-0000-0000-000000000001';

reset role;set role service_role;
select test.assert_equals('other_owner_mutations_leave_entry_intact',(select content from public.playbook_entries where id='26000000-0000-0000-0000-000000000001'),'Prepare dinner before a late meeting.');
select test.assert_fails('source_challenge_owner_integrity_is_database_enforced',$stmt$insert into public.playbook_entries(owner_id,category,content,source_challenge_id) values('22222222-2222-2222-2222-222222222222','lesson','Foreign source','bbbbbbbb-0000-0000-0000-000000000001')$stmt$,'23503');

reset role;set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
delete from public.playbook_entries where id='26000000-0000-0000-0000-000000000001';
select test.assert_equals('owner_deletes_playbook_entry',(select count(*) from public.playbook_entries),0::bigint);
reset role;set role anon;
select test.assert_fails('anon_cannot_read_playbook','select count(*) from public.playbook_entries','42501');
reset role;
