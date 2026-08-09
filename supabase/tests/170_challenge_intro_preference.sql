-- Exercises 20260813000000_challenge_intro_preference.sql: every profile
-- defaults to show_challenge_intro = true (no one has opted out yet), the
-- owner can turn it off through the same grant shape as display_name, and
-- no other role can read or write another owner's preference.
set role service_role;

do $$
begin
  insert into auth.users (id, email) values
    ('71111111-0000-0000-0000-000000000001', 'intro-pref-owner@example.test'),
    ('71111111-0000-0000-0000-000000000002', 'intro-pref-other@example.test');
  insert into public.profiles (id) values
    ('71111111-0000-0000-0000-000000000001'),
    ('71111111-0000-0000-0000-000000000002');
end;
$$;

do $$
declare
  pref boolean;
begin
  select show_challenge_intro into pref from public.profiles where id = '71111111-0000-0000-0000-000000000001';
  perform test.assert_equals('new_profile_defaults_to_showing_the_intro', pref, true);
end;
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '71111111-0000-0000-0000-000000000001', false);

do $$
declare
  pref boolean;
begin
  update public.profiles set show_challenge_intro = false where id = '71111111-0000-0000-0000-000000000001';
  select show_challenge_intro into pref from public.profiles where id = '71111111-0000-0000-0000-000000000001';
  perform test.assert_equals('the_owner_can_turn_the_intro_off', pref, false);

  update public.profiles set show_challenge_intro = true where id = '71111111-0000-0000-0000-000000000001';
  select show_challenge_intro into pref from public.profiles where id = '71111111-0000-0000-0000-000000000001';
  perform test.assert_equals('the_owner_can_turn_it_back_on', pref, true);
end;
$$;

-- A non-owner's UPDATE against someone else's preference succeeds as a
-- statement (RLS filters rows, it does not error) but must affect exactly
-- zero rows, matching 040_rls_authenticated_non_owner.sql's convention for
-- exactly this shape of check.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '71111111-0000-0000-0000-000000000002', false);

do $$
declare
  affected bigint;
begin
  update public.profiles set show_challenge_intro = false where id = '71111111-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  perform test.assert_equals('non_owner_cannot_flip_someone_elses_intro_preference', affected, 0::bigint);
end;
$$;

reset role;
set role service_role;
do $$
declare
  pref boolean;
begin
  select show_challenge_intro into pref from public.profiles where id = '71111111-0000-0000-0000-000000000001';
  perform test.assert_equals('the_original_owners_preference_is_unaffected', pref, true);
end;
$$;
reset role;
