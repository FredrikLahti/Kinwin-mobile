-- Exercises the on_auth_user_created trigger from
-- 20260804000000_profile_on_signup.sql: a new auth.users row must produce
-- exactly one matching public.profiles row, id-for-id, without the client
-- ever choosing that id itself; retried/duplicated inserts must not create
-- a second profile row.
set role service_role;

do $$
declare
  new_user_id uuid := gen_random_uuid();
  profile_count bigint;
  profile_id uuid;
begin
  insert into auth.users (id, email) values (new_user_id, 'trigger-test@example.test');
  select count(*) into profile_count from public.profiles where id = new_user_id;
  perform test.assert_equals('signup_creates_exactly_one_profile', profile_count, 1::bigint);

  select id into profile_id from public.profiles where id = new_user_id;
  perform test.assert_equals('profile_id_matches_auth_user_id', profile_id, new_user_id);
end;
$$;

-- Idempotency: auth.users.id is itself a primary key, so a real second
-- `insert into auth.users` for the same id (a literally retried signup)
-- can never reach the trigger body at all — Postgres rejects it first.
-- What the trigger must still tolerate is a profile row that already
-- exists for an id by the time it runs (e.g. left over from a retried or
-- partially-completed prior operation). This re-executes the trigger
-- function's exact insert pattern — `insert ... on conflict (id) do
-- nothing` — a second time against an id that already has a profile, the
-- same statement the trigger body runs, proving that pattern itself never
-- raises or duplicates.
do $$
declare
  repeat_id uuid := gen_random_uuid();
  profile_count bigint;
begin
  insert into auth.users (id, email) values (repeat_id, 'idempotent-test@example.test');
  select count(*) into profile_count from public.profiles where id = repeat_id;
  perform test.assert_equals('trigger_creates_profile_once', profile_count, 1::bigint);

  insert into public.profiles (id) values (repeat_id) on conflict (id) do nothing;
  select count(*) into profile_count from public.profiles where id = repeat_id;
  perform test.assert_equals('repeating_the_trigger_insert_pattern_does_not_duplicate', profile_count, 1::bigint);
end;
$$;

-- The trigger function itself must not be directly callable by any client role.
reset role;
set role authenticated;
select test.assert_fails('authenticated_cannot_call_trigger_function_directly', 'select public.handle_new_user()', '42501');
reset role;
set role anon;
select test.assert_fails('anon_cannot_call_trigger_function_directly', 'select public.handle_new_user()', '42501');
