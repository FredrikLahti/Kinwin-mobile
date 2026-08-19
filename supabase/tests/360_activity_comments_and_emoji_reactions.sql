-- Exercises 20260907000000_activity_comments_and_emoji_reactions.sql: the
-- emoji reaction vocabulary swap, the new activity_comments table's RLS and
-- content-safety boundary, comment deletion (author or activity owner), and
-- the extended submit_social_report comment-reporting path.
--
-- M owns one real social_activity row. N and P are accepted Kin with M; S
-- is a third accepted Kin (kept unrelated to P's comments, to prove one
-- Kin cannot delete another Kin's comment). O is a total stranger (no
-- kin_connections row at all). Q's connection to M was removed. R's
-- connection to M is blocked.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('99111111-0000-0000-0000-000000000001', 'social-m@example.test'),
    ('99111111-0000-0000-0000-000000000002', 'social-n@example.test'),
    ('99111111-0000-0000-0000-000000000003', 'social-o@example.test'),
    ('99111111-0000-0000-0000-000000000004', 'social-p@example.test'),
    ('99111111-0000-0000-0000-000000000005', 'social-q@example.test'),
    ('99111111-0000-0000-0000-000000000006', 'social-r@example.test'),
    ('99111111-0000-0000-0000-000000000007', 'social-s@example.test');
  insert into public.kin_connections (id, requester_id, recipient_id, status) values
    (gen_random_uuid(), '99111111-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000002', 'accepted'),
    (gen_random_uuid(), '99111111-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', 'accepted'),
    (gen_random_uuid(), '99111111-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000005', 'removed'),
    (gen_random_uuid(), '99111111-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000007', 'accepted');
  insert into public.kin_connections (id, requester_id, recipient_id, status, blocked_by) values
    (gen_random_uuid(), '99111111-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000006', 'blocked', '99111111-0000-0000-0000-000000000001');

  -- A minimal real activity row, written as service_role exactly like
  -- social_activity's own RLS/trigger already require (never client-
  -- inserted) — the surrounding challenge/draft fixture chain
  -- 190_social_activity.sql builds is not needed here, since this file
  -- only exercises reactions/comments on top of an activity that already
  -- exists, not social_activity's own creation semantics.
  insert into public.social_activity (id, owner_id, kind, payload, dedupe_key) values
    ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000001', 'challenge_started', jsonb_build_object('behavior', jsonb_build_object('description', 'x')), 'test-360:1');
end;
$$;
reset role;

-- ---------------------------------------------------------------------
-- Reactions: emoji vocabulary, visibility boundary, replacement
-- ---------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000002', false);
do $$
declare
  v_affected bigint;
begin
  insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000002', '🔥');
  get diagnostics v_affected = row_count;
  perform test.assert_equals('accepted_kin_can_react_with_emoji', v_affected, 1::bigint);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000003', false);
select test.assert_fails('stranger_cannot_react',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000003', '🔥')$stmt$,
  '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000006', false);
select test.assert_fails('blocked_kin_cannot_react',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000006', '🔥')$stmt$,
  '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000005', false);
select test.assert_fails('removed_kin_cannot_react',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000005', '🔥')$stmt$,
  '42501');
reset role;

-- Replacement: N's real "change my reaction" flow is delete-then-insert
-- (see setMyReaction in lib/supabase/kin-repository.ts) — proves the final
-- persisted state is the new kind, not both or neither.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000002', false);
do $$
begin
  delete from public.activity_reactions where activity_id = '99222222-0000-0000-0000-000000000001' and user_id = '99111111-0000-0000-0000-000000000002';
  insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000002', '❤️');
  perform test.assert_equals('reaction_replacement_persists_new_kind_only',
    (select kind from public.activity_reactions where activity_id = '99222222-0000-0000-0000-000000000001' and user_id = '99111111-0000-0000-0000-000000000002'),
    '❤️');
  perform test.assert_equals('reaction_replacement_leaves_exactly_one_row',
    (select count(*) from public.activity_reactions where activity_id = '99222222-0000-0000-0000-000000000001' and user_id = '99111111-0000-0000-0000-000000000002'),
    1::bigint);
end;
$$;
reset role;

-- The old word-based vocabulary (and anything else outside the five emoji)
-- is now a persisted-data integrity violation, not just a stale UI choice —
-- exercised by the activity's own owner reacting to their own item (allowed
-- by activity_reactions_insert_own's owner clause, mirroring
-- social_activity's own select policy) with an old word.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000001', false);
select test.assert_fails('invalid_reaction_kind_rejected',
  $stmt$insert into public.activity_reactions (activity_id, user_id, kind)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000001', 'respect')$stmt$,
  '23514');

-- Blocking N must immediately revoke N's own prior access — not just block
-- future requests. A real state transition (block_kin), not a static
-- fixture, since this is exactly the "improper retained access" risk.
select public.block_kin('99111111-0000-0000-0000-000000000002');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000002', false);
select test.assert_equals('blocked_kin_loses_activity_visibility',
  (select count(*) from public.social_activity where id = '99222222-0000-0000-0000-000000000001'), 0::bigint);
select test.assert_equals('blocked_kin_loses_reaction_visibility',
  (select count(*) from public.activity_reactions where activity_id = '99222222-0000-0000-0000-000000000001'), 0::bigint);
reset role;

-- ---------------------------------------------------------------------
-- Comments: visibility, authorship, content safety, length
-- ---------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000004', false);
do $$
declare
  v_comment_id uuid;
begin
  insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', 'Book the restaurant, you idiot.')
    returning id into v_comment_id;
  perform set_config('test.comment1_id', v_comment_id::text, false);
  perform test.assert_true('accepted_kin_can_write_comment', v_comment_id is not null);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000001', false);
select test.assert_equals('owner_can_read_kin_comment',
  (select count(*) from public.activity_comments where activity_id = '99222222-0000-0000-0000-000000000001'), 1::bigint);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000003', false);
select test.assert_equals('stranger_cannot_read_comments',
  (select count(*) from public.activity_comments where activity_id = '99222222-0000-0000-0000-000000000001'), 0::bigint);
select test.assert_fails('stranger_cannot_insert_comment',
  $stmt$insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000003', 'hi')$stmt$,
  '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000004', false);
select test.assert_fails('forged_author_impossible',
  $stmt$insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000001', 'not really from me')$stmt$,
  '42501');
select test.assert_fails('empty_comment_rejected',
  $stmt$insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', '   ')$stmt$,
  '23514');
select test.assert_fails('too_long_comment_rejected',
  format($stmt$insert into public.activity_comments (activity_id, author_id, body) values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', %L)$stmt$,
    repeat('a', 201)),
  '23514');
select test.assert_fails('unsafe_content_rejected',
  $stmt$insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', 'total bitch')$stmt$,
  '22023');
reset role;

-- Deletion: author can delete their own comment.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000004', false);
do $$
declare
  v_affected bigint;
begin
  delete from public.activity_comments where id = current_setting('test.comment1_id')::uuid;
  get diagnostics v_affected = row_count;
  perform test.assert_equals('author_can_delete_own_comment', v_affected, 1::bigint);
end;
$$;

-- A fresh second comment from P, for the delete-authorization tests below.
do $$
declare
  v_comment_id uuid;
begin
  insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', 'Second comment.')
    returning id into v_comment_id;
  perform set_config('test.comment2_id', v_comment_id::text, false);
end;
$$;
reset role;

-- S is a real, unrelated accepted Kin (not the author, not the activity
-- owner) — must not be able to delete P's comment.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000007', false);
do $$
declare
  v_affected bigint;
begin
  delete from public.activity_comments where id = current_setting('test.comment2_id')::uuid;
  get diagnostics v_affected = row_count;
  perform test.assert_equals('unrelated_kin_cannot_delete_others_comment', v_affected, 0::bigint);
end;
$$;
reset role;

-- M, the activity's owner (not the comment's author), CAN remove it from
-- their own Activity item — the approved second deletion actor.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000001', false);
do $$
declare
  v_affected bigint;
begin
  delete from public.activity_comments where id = current_setting('test.comment2_id')::uuid;
  get diagnostics v_affected = row_count;
  perform test.assert_equals('activity_owner_can_remove_comment', v_affected, 1::bigint);
end;
$$;
reset role;

-- R's connection to M was blocked from the start (never accepted) —
-- confirms a blocked relationship never had comment visibility either.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000006', false);
select test.assert_equals('blocked_relationship_cannot_read_comments',
  (select count(*) from public.activity_comments where activity_id = '99222222-0000-0000-0000-000000000001'), 0::bigint);
select test.assert_fails('blocked_relationship_cannot_insert_comment',
  $stmt$insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000006', 'let me in')$stmt$,
  '42501');
reset role;

-- ---------------------------------------------------------------------
-- Reporting: extended submit_social_report comment target
-- ---------------------------------------------------------------------

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000004', false);
do $$
declare
  v_comment_id uuid;
begin
  insert into public.activity_comments (activity_id, author_id, body)
    values ('99222222-0000-0000-0000-000000000001', '99111111-0000-0000-0000-000000000004', 'Third comment, reportable.')
    returning id into v_comment_id;
  perform set_config('test.comment3_id', v_comment_id::text, false);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000001', false);
select test.assert_equals('accepted_kin_can_report_comment',
  (select public.submit_social_report(
    '99111111-0000-0000-0000-000000000004', null, 'harassment', 'not cool', current_setting('test.comment3_id')::uuid
  ) ->> 'status'),
  'submitted');

-- Claiming the wrong person authored a real, visible comment is rejected —
-- the server independently verifies authorship, never trusting the
-- caller's own claim.
select test.assert_fails('report_comment_author_mismatch_rejected',
  format($stmt$select public.submit_social_report('99111111-0000-0000-0000-000000000007', null, 'harassment', null, %L::uuid)$stmt$,
    current_setting('test.comment3_id')),
  '22023');

-- Both an activity target and a comment target at once is ambiguous and rejected.
select test.assert_fails('report_both_targets_at_once_rejected',
  format($stmt$select public.submit_social_report('99111111-0000-0000-0000-000000000004', '99222222-0000-0000-0000-000000000001'::uuid, 'harassment', null, %L::uuid)$stmt$,
    current_setting('test.comment3_id')),
  '22023');
reset role;

-- O (a total stranger, cannot see the comment at all) cannot report it —
-- "not found," never confirming the comment exists.
set role authenticated;
select set_config('request.jwt.claim.sub', '99111111-0000-0000-0000-000000000003', false);
select test.assert_fails('stranger_cannot_report_unseen_comment',
  format($stmt$select public.submit_social_report('99111111-0000-0000-0000-000000000004', null, 'harassment', null, %L::uuid)$stmt$,
    current_setting('test.comment3_id')),
  'P0002');
reset role;
