-- The result client reads terminal challenges through the existing owner RLS.
-- These assertions exercise both terminal states and the exact owner-scoped
-- selection shape without introducing a new database surface.
set role authenticated;
select set_config('request.jwt.claim.sub','a1111111-0000-0000-0000-000000000001',false);
select test.assert_equals('owner_reads_completed_success_for_result',
  (select challenge_status from public.challenges
   where owner_id='a1111111-0000-0000-0000-000000000001'
     and id='a3333333-0000-0000-0000-000000000002'
     and challenge_status in ('completed_success','completed_failure')),
  'completed_success');
select test.assert_equals('terminal_result_query_excludes_non_terminal_challenges',
  (select count(*) from public.challenges
   where owner_id='a1111111-0000-0000-0000-000000000001'
     and challenge_status in ('completed_success','completed_failure')),
  1::bigint);
select test.assert_equals('owner_cannot_read_foreign_completed_failure',
  (select count(*) from public.challenges
   where owner_id='d9999999-0000-0000-0000-000000000002'
     and id='e1111111-0000-0000-0000-000000000002'
     and challenge_status in ('completed_success','completed_failure')),
  0::bigint);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','d9999999-0000-0000-0000-000000000002',false);
select test.assert_equals('owner_reads_completed_failure_for_result',
  (select challenge_status from public.challenges
   where owner_id='d9999999-0000-0000-0000-000000000002'
     and id='e1111111-0000-0000-0000-000000000002'
     and challenge_status in ('completed_success','completed_failure')),
  'completed_failure');
reset role;
