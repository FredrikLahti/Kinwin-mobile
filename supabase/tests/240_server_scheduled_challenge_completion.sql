-- Database half of the scheduled completion worker. Edge orchestration and
-- per-challenge failure isolation are covered by worker.test.ts; the
-- deterministic evaluator has its own table-driven tests.

set role service_role;

create or replace function pg_temp.seed_scheduled_challenge(
  p_owner uuid,
  p_challenge uuid,
  p_status text,
  p_reporting_closes_at timestamptz
) returns void language plpgsql as $body$
begin
  insert into auth.users (id, email) values (p_owner, p_owner::text || '@scheduled.test');
  insert into public.challenges (
    id, owner_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
  ) values (
    p_challenge, p_owner, 1, 1, p_status,
    'Europe/Stockholm', now() - interval '15 days', now() - interval '14 days', now() - interval '1 day',
    jsonb_build_object(
      'id', p_challenge, 'ownerId', p_owner, 'schemaVersion', 1, 'ruleEngineVersion', 1,
      'goal', 'Scheduled fixture',
      'behavior', jsonb_build_object('description', 'Read daily', 'completionDefinition', 'Read once'),
      'duration', jsonb_build_object('unit', 'week', 'value', 2),
      'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
      'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
      'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'),
      'sitOutAcknowledged', true, 'membershipStatusAtActivation', 'trialing'
    )
  );
  insert into public.consequences (
    challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at
  ) values (p_challenge, p_owner, 'active', 5000, 'USD', 'authorized', now() - interval '15 days');
  insert into public.challenge_periods (
    challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload
  ) values (
    p_challenge, 1, 'day', now() - interval '2 days', now() - interval '1 day', p_reporting_closes_at,
    jsonb_build_object('type', 'completion_target', 'target', 1)
  );
end;
$body$;

select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'active', now() + interval '1 hour');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'active', now() - interval '1 hour');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000003', 'awaiting_resolution', now() - interval '2 hours');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000004', 'completion_mode', now() - interval '1 hour');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000005', 'superseded', now() - interval '1 hour');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000006', 'canceled_before_activation', now() - interval '1 hour');
select pg_temp.seed_scheduled_challenge('f1000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000007', 'pending_activation', now() - interval '1 hour');

create temporary table claimed_once as select * from public.claim_due_challenge_completions(50);

select test.assert_equals('scheduled_worker_ignores_open_reporting_window',
  (select count(*) from claimed_once where challenge_id = 'f2000000-0000-0000-0000-000000000001'), 0::bigint);
select test.assert_equals('scheduled_worker_claims_elapsed_active',
  (select count(*) from claimed_once where challenge_id = 'f2000000-0000-0000-0000-000000000002' and previous_status = 'active'), 1::bigint);
select test.assert_equals('scheduled_worker_claims_existing_awaiting',
  (select count(*) from claimed_once where challenge_id = 'f2000000-0000-0000-0000-000000000003' and previous_status = 'awaiting_resolution'), 1::bigint);
select test.assert_equals('scheduled_worker_claims_completion_mode',
  (select count(*) from claimed_once where challenge_id = 'f2000000-0000-0000-0000-000000000004' and previous_status = 'completion_mode'), 1::bigint);
select test.assert_equals('elapsed_active_becomes_awaiting_resolution',
  (select challenge_status from public.challenges where id = 'f2000000-0000-0000-0000-000000000002'), 'awaiting_resolution');
select test.assert_equals('elapsed_completion_mode_becomes_awaiting_resolution',
  (select challenge_status from public.challenges where id = 'f2000000-0000-0000-0000-000000000004'), 'awaiting_resolution');
select test.assert_equals('superseded_cancelled_and_pending_are_ignored',
  (select count(*) from claimed_once where challenge_id in (
    'f2000000-0000-0000-0000-000000000005',
    'f2000000-0000-0000-0000-000000000006',
    'f2000000-0000-0000-0000-000000000007'
  )), 0::bigint);

-- Repeat discovery is intentionally safe. Awaiting rows remain candidates
-- until the idempotent terminal RPC succeeds; no status is toggled back.
create temporary table claimed_twice as select * from public.claim_due_challenge_completions(50);
select test.assert_equals('repeated_claim_preserves_awaiting_state',
  (select current_status from claimed_twice where challenge_id = 'f2000000-0000-0000-0000-000000000002'), 'awaiting_resolution');

-- Simulate the evaluator's two possible terminal decisions. The existing
-- RPC owns the row lock and event dedupe; repeating either call is a no-op.
select public.finalize_challenge_result(
  'f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002',
  'completed_success', 'challenge_succeeded', jsonb_build_object('behavior', jsonb_build_object('description', 'Read daily')),
  'challenge_succeeded:f2000000-0000-0000-0000-000000000002'
);
select public.finalize_challenge_result(
  'f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002',
  'completed_success', 'challenge_succeeded', jsonb_build_object('behavior', jsonb_build_object('description', 'Read daily')),
  'challenge_succeeded:f2000000-0000-0000-0000-000000000002'
);
select public.finalize_challenge_result(
  'f1000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000004',
  'completed_failure', 'challenge_failed', jsonb_build_object('behavior', jsonb_build_object('description', 'Read daily')),
  'challenge_failed:f2000000-0000-0000-0000-000000000004'
);
select public.finalize_challenge_result(
  'f1000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000004',
  'completed_failure', 'challenge_failed', jsonb_build_object('behavior', jsonb_build_object('description', 'Read daily')),
  'challenge_failed:f2000000-0000-0000-0000-000000000004'
);

select test.assert_equals('scheduled_success_is_terminal',
  (select challenge_status from public.challenges where id = 'f2000000-0000-0000-0000-000000000002'), 'completed_success');
select test.assert_equals('scheduled_failure_is_terminal',
  (select challenge_status from public.challenges where id = 'f2000000-0000-0000-0000-000000000004'), 'completed_failure');
select test.assert_equals('success_social_event_created_once',
  (select count(*) from public.social_activity where challenge_id = 'f2000000-0000-0000-0000-000000000002' and kind = 'challenge_succeeded'), 1::bigint);
select test.assert_equals('failure_social_event_created_once',
  (select count(*) from public.social_activity where challenge_id = 'f2000000-0000-0000-0000-000000000004' and kind = 'challenge_failed'), 1::bigint);
select test.assert_equals('scheduled_outcome_does_not_change_consequence_state',
  (select count(*) from public.consequences where challenge_id in (
    'f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000004'
  ) and status = 'active'), 2::bigint);
select test.assert_equals('scheduled_outcome_creates_no_charge_attempt',
  (select count(*) from private.consequence_charge_attempts a
   join public.consequences c on c.id = a.consequence_id
   where c.challenge_id in ('f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000004')), 0::bigint);
select test.assert_equals('scheduled_outcome_creates_no_reward_fulfillment',
  (select count(*) from private.reward_fulfillments f
   join public.consequences c on c.id = f.consequence_id
   where c.challenge_id in ('f2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000004')), 0::bigint);

-- Lease and run observability.
create temporary table worker_start as
  select public.start_challenge_completion_worker() as result;
select test.assert_equals('first_worker_gets_lease', (select result ->> 'status' from worker_start), 'started');
select test.assert_equals('overlapping_worker_is_rejected',
  public.start_challenge_completion_worker() ->> 'status', 'already_running');

select public.finish_challenge_completion_worker(
  (select (result ->> 'runId')::uuid from worker_start),
  (select (result ->> 'leaseToken')::uuid from worker_start),
  'succeeded', 3, 2, 1, 1, 0, null
);
select test.assert_equals('worker_run_history_records_counts',
  (select eligible_count from private.challenge_completion_worker_runs where id = (select (result ->> 'runId')::uuid from worker_start)), 3);
select test.assert_equals('worker_run_history_records_success',
  (select status from private.challenge_completion_worker_runs where id = (select (result ->> 'runId')::uuid from worker_start)), 'succeeded');
select test.assert_true('worker_run_history_records_finish_time',
  (select finished_at is not null from private.challenge_completion_worker_runs where id = (select (result ->> 'runId')::uuid from worker_start)));

reset role;

set role authenticated;
select test.assert_fails('authenticated_cannot_claim_scheduled_work',
  'select * from public.claim_due_challenge_completions(50)', '42501');
select test.assert_fails('authenticated_cannot_start_scheduled_worker',
  'select public.start_challenge_completion_worker()', '42501');
select test.assert_fails('authenticated_cannot_read_worker_runs',
  'select * from private.challenge_completion_worker_runs', '42501');
reset role;
