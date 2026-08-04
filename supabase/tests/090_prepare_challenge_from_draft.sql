-- Exercises public.prepare_challenge_from_draft (20260805000000, amended by
-- 20260808000000): the trusted RPC boundary that turns a
-- ready_for_activation draft into a pending_activation challenge +
-- recipients + consequence, atomically, idempotently, and only for the
-- draft's own owner. Run as the real caller roles PostgREST would present
-- (authenticated with a JWT sub claim, anon with none) — this function's
-- whole point is being safely callable by the client, so service_role is
-- used here only to take trusted before/after snapshots, never to call the
-- RPC itself.
--
-- Every rejection case below runs *before* the real success case, and a
-- cleanup step cancels that success case's commitment at the very end —
-- because challenges_owner_one_pending_idx allows Owner A only one
-- pending_activation challenge at a time, every other test in this file
-- needs Owner A to still have zero when it runs, or its own rejection
-- would be masked by "another pending commitment already exists" instead
-- of the specific reason each test actually exists to prove.

create temporary table rpc_capture (key text primary key, value text);
-- Test files impersonate anon/authenticated/service_role via SET ROLE (see
-- supabase/tests/README.md); this table needs to stay writable/readable
-- across those role switches for the whole file, same session throughout.
grant all on rpc_capture to anon, authenticated, service_role;

-- Another authenticated user cannot prepare Owner A's draft. The rejection
-- is identical to "not found" (never discloses that the draft exists), and
-- leaves the draft and challenge table completely untouched.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select test.assert_fails(
  'non_owner_cannot_prepare_draft',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000003')$stmt$,
  'P0002'
);
reset role;
set role service_role;
do $$
declare
  status_val text;
  challenge_count bigint;
begin
  select draft_status into status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  perform test.assert_equals('non_owner_attempt_leaves_draft_untouched', status_val, 'ready_for_activation');
  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-000000000003';
  perform test.assert_equals('non_owner_attempt_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;
reset role;

-- Incomplete/tampered drafts are rejected even though they satisfy the
-- looser table-level CHECK constraints on challenge_drafts.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails(
  'incomplete_draft_rejected',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000004')$stmt$,
  '22023'
);
reset role;
set role service_role;
do $$
declare
  status_val text;
  challenge_count bigint;
begin
  select draft_status into status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  perform test.assert_equals('incomplete_draft_left_untouched', status_val, 'ready_for_activation');
  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-000000000004';
  perform test.assert_equals('incomplete_draft_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;
reset role;

-- An otherwise-complete draft that is simply not ready yet is rejected too.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails(
  'not_ready_draft_rejected',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000005')$stmt$,
  '22023'
);

-- An unknown draft id is rejected the same way as one owned by someone else.
select test.assert_fails(
  'unknown_draft_rejected',
  $stmt$select public.prepare_challenge_from_draft('99999999-9999-9999-9999-999999999999')$stmt$,
  'P0002'
);

-- A draft that is otherwise fully valid but carries a bare
-- {"direction":"build"} rule (no measurement/rhythm) and a matching
-- skeleton successRule — satisfying challenge_drafts' own coarse "is a
-- JSON object" CHECK constraints but not a real, evaluable commitment —
-- is rejected, and creates nothing.
select test.assert_fails(
  'incomplete_rule_pair_rejected',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000007')$stmt$,
  '22023'
);
do $$
declare
  status_val text;
  challenge_count bigint;
begin
  select draft_status into status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000007';
  perform test.assert_equals('incomplete_rule_pair_draft_left_untouched', status_val, 'ready_for_activation');
  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-000000000007';
  perform test.assert_equals('incomplete_rule_pair_creates_no_challenge', challenge_count, 0::bigint);
end;
$$;
reset role;

-- A request with no real identity (auth.uid() is null) is rejected before
-- any draft lookup even runs.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select test.assert_fails(
  'unauthenticated_call_rejected',
  $stmt$select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000002')$stmt$,
  '28000'
);
reset role;

-- Anonymous clients have no execute grant on this function at all.
set role anon;
select test.assert_fails('anon_cannot_call_prepare_function', 'select public.prepare_challenge_from_draft(gen_random_uuid())', '42501');
reset role;

-- Atomicity: if anything in the surrounding transaction fails after the RPC
-- has already written its rows, none of those rows survive. This proves
-- prepare_challenge_from_draft is genuinely one atomic unit of work rather
-- than several statements a caller could ever observe half-applied. Runs
-- while Owner A still has zero pending commitments (every case above was
-- rejected before creating one), so the RPC gets far enough to actually
-- write rows before the deliberate downstream failure rolls them back.
set role service_role;
do $$
declare
  before_challenges bigint;
  before_recipients bigint;
  before_consequences bigint;
begin
  select count(*) into before_challenges from public.challenges;
  select count(*) into before_recipients from public.challenge_recipients;
  select count(*) into before_consequences from public.consequences;
  insert into rpc_capture (key, value) values
    ('before_challenges', before_challenges::text),
    ('before_recipients', before_recipients::text),
    ('before_consequences', before_consequences::text);
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select test.assert_fails(
  'prepare_rolls_back_completely_on_downstream_failure',
  $stmt$do $inner$
    begin
      perform public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000006');
      raise exception 'simulated downstream failure after prepare succeeded';
    end
  $inner$;$stmt$,
  'P0001'
);
reset role;

set role service_role;
do $$
declare
  before_challenges bigint;
  before_recipients bigint;
  before_consequences bigint;
  after_challenges bigint;
  after_recipients bigint;
  after_consequences bigint;
  draft_status_val text;
begin
  select value::bigint into before_challenges from rpc_capture where key = 'before_challenges';
  select value::bigint into before_recipients from rpc_capture where key = 'before_recipients';
  select value::bigint into before_consequences from rpc_capture where key = 'before_consequences';
  select count(*) into after_challenges from public.challenges;
  select count(*) into after_recipients from public.challenge_recipients;
  select count(*) into after_consequences from public.consequences;
  perform test.assert_equals('rollback_leaves_challenges_count_unchanged', after_challenges, before_challenges);
  perform test.assert_equals('rollback_leaves_recipients_count_unchanged', after_recipients, before_recipients);
  perform test.assert_equals('rollback_leaves_consequences_count_unchanged', after_consequences, before_consequences);

  select draft_status into draft_status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000006';
  perform test.assert_equals('rollback_leaves_draft_unarchived', draft_status_val, 'ready_for_activation');
end;
$$;
reset role;

-- Successful preparation returns a pending_activation challenge id. Every
-- case above having left Owner A at zero pending commitments is what makes
-- this the first one allowed to actually succeed.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare
  result jsonb;
begin
  select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('prepare_returns_pending_status', result ->> 'status', 'pending_activation');
  insert into rpc_capture (key, value) values ('draft2_challenge_id', result ->> 'challengeId');
end;
$$;

-- Exactly one challenge row was created, with no fake activation fields.
do $$
declare
  captured_id uuid;
  challenge_count bigint;
  status_val text;
  schema_v int;
  engine_v int;
  has_activation boolean;
begin
  select value::uuid into captured_id from rpc_capture where key = 'draft2_challenge_id';

  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  perform test.assert_equals('prepare_creates_exactly_one_challenge', challenge_count, 1::bigint);

  select challenge_status, schema_version, rule_engine_version,
    (activated_at is not null or starts_at is not null or planned_ends_at is not null
      or timezone is not null or activation_snapshot is not null)
    into status_val, schema_v, engine_v, has_activation
    from public.challenges where id = captured_id;
  perform test.assert_equals('prepared_challenge_status', status_val, 'pending_activation');
  perform test.assert_equals('prepared_challenge_schema_version', schema_v, 1);
  perform test.assert_equals('prepared_challenge_engine_version', engine_v, 1);
  perform test.assert_true('prepared_challenge_has_no_activation_fields', not has_activation);
end;
$$;

-- Its immutable recipient row was created (organizer role attached correctly).
do $$
declare
  captured_id uuid;
  recipient_count bigint;
  name_val text;
  sort_val smallint;
  role_val text;
begin
  select value::uuid into captured_id from rpc_capture where key = 'draft2_challenge_id';
  select count(*) into recipient_count from public.challenge_recipients where challenge_id = captured_id;
  perform test.assert_equals('prepared_recipient_count', recipient_count, 1::bigint);
  select display_name, sort_order, recipient_role into name_val, sort_val, role_val
    from public.challenge_recipients where challenge_id = captured_id;
  perform test.assert_equals('prepared_recipient_name', name_val, 'Anna');
  perform test.assert_equals('prepared_recipient_sort_order', sort_val, 0::smallint);
  perform test.assert_equals('prepared_recipient_is_organizer', role_val, 'recipient_organizer');
end;
$$;

-- One consequence row in an honest pre-payment state.
do $$
declare
  captured_id uuid;
  consequence_count bigint;
  status_val text;
  stake_val bigint;
  currency_val text;
  auth_status text;
begin
  select value::uuid into captured_id from rpc_capture where key = 'draft2_challenge_id';
  select count(*) into consequence_count from public.consequences where challenge_id = captured_id;
  perform test.assert_equals('prepared_consequence_count', consequence_count, 1::bigint);
  select status, stake_minor_units, currency, authorization_status into status_val, stake_val, currency_val, auth_status
    from public.consequences where challenge_id = captured_id;
  perform test.assert_equals('prepared_consequence_status', status_val, 'payment_method_required');
  perform test.assert_equals('prepared_consequence_stake', stake_val, 7500::bigint);
  perform test.assert_equals('prepared_consequence_currency', currency_val, 'USD');
  perform test.assert_equals('prepared_consequence_not_authorized', auth_status, 'not_requested');
end;
$$;

-- The source draft was archived only after every insert succeeded.
do $$
declare
  status_val text;
begin
  select draft_status into status_val from public.challenge_drafts where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  perform test.assert_equals('prepared_draft_archived', status_val, 'archived');
end;
$$;

-- Repeated preparation of the same (now-archived) draft returns the same
-- challenge — never a duplicate, and never re-rejected for being archived.
do $$
declare
  result jsonb;
  first_id uuid;
  challenge_count bigint;
begin
  select value::uuid into first_id from rpc_capture where key = 'draft2_challenge_id';
  select public.prepare_challenge_from_draft('aaaaaaaa-0000-0000-0000-000000000002') into result;
  perform test.assert_equals('repeat_prepare_returns_same_challenge_id', (result ->> 'challengeId')::uuid, first_id);
  perform test.assert_equals('repeat_prepare_returns_same_status', result ->> 'status', 'pending_activation');
  select count(*) into challenge_count from public.challenges where source_draft_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  perform test.assert_equals('repeat_prepare_creates_no_duplicate', challenge_count, 1::bigint);
end;
$$;

-- Direct client writes to the tables this RPC owns remain impossible —
-- already proven in 030/040, re-asserted here against the exact rows this
-- file created, so this file is self-contained proof the RPC is the only path in.
do $$
declare
  captured_id uuid;
begin
  select value::uuid into captured_id from rpc_capture where key = 'draft2_challenge_id';
  perform test.assert_fails(
    'direct_challenge_status_update_denied',
    format($stmt$update public.challenges set challenge_status = 'active' where id = %L$stmt$, captured_id),
    '42501'
  );
  perform test.assert_fails(
    'direct_consequence_status_update_denied',
    format($stmt$update public.consequences set status = 'authorized' where challenge_id = %L$stmt$, captured_id),
    '42501'
  );
  perform test.assert_fails(
    'direct_recipient_insert_denied',
    format($stmt$insert into public.challenge_recipients (challenge_id, display_name, sort_order) values (%L, 'Injected', 3)$stmt$, captured_id),
    '42501'
  );
end;
$$;
reset role;

-- Leaves Owner A with zero pending commitments again, via the same trusted
-- cancel_pending_challenge RPC 100_cancel_pending_challenge.sql tests in
-- depth, so later files can create their own fresh pending commitment
-- without colliding with challenges_owner_one_pending_idx.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$
declare
  captured_id uuid;
begin
  select value::uuid into captured_id from rpc_capture where key = 'draft2_challenge_id';
  perform public.cancel_pending_challenge(captured_id);
end;
$$;
reset role;
