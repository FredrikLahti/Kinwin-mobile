-- Exercises 20260820000000_challenge_completion_lifecycle.sql: the new
-- `awaiting_resolution` status and the reconcile_challenge_lifecycle
-- function that produces it, the widened one-active-or-unresolved
-- invariant, finalize_challenge_result's new "must be awaiting_resolution"
-- guard, and the canonical-current-challenge view's defensive time filter.
--
-- Every challenge/period pair here is inserted directly as service_role
-- (never through activate_challenge_draft/private.generate_challenge_periods),
-- so each fixture's reporting_closes_at boundary can be placed precisely in
-- the past or future rather than depending on real wall-clock timing. Role
-- is set explicitly around every block rather than relied on as leftover
-- state from a previous statement, same convention as every earlier file.
--
-- NOT machine-verified against a real PostgreSQL server as of this revision
-- -- see 150_full_activation.sql's header for why, and
-- supabase/tests/README.md for how to actually run this suite.

set role service_role;
do $$
begin
  insert into auth.users (id, email) values
    ('d9999999-0000-0000-0000-000000000001', 'lifecycle-not-yet-ended@example.test'),
    ('d9999999-0000-0000-0000-000000000002', 'lifecycle-just-ended@example.test'),
    ('d9999999-0000-0000-0000-000000000003', 'lifecycle-max-period-governs@example.test'),
    ('d9999999-0000-0000-0000-000000000004', 'lifecycle-superseded@example.test'),
    ('d9999999-0000-0000-0000-000000000005', 'lifecycle-canonical-defensive@example.test'),
    ('d9999999-0000-0000-0000-000000000006', 'lifecycle-still-active-finalize@example.test'),
    ('d9999999-0000-0000-0000-000000000007', 'lifecycle-canonical-viewer@example.test');

  insert into public.kin_connections (id, requester_id, recipient_id, status)
    values (gen_random_uuid(), 'd9999999-0000-0000-0000-000000000005', 'd9999999-0000-0000-0000-000000000007', 'accepted');
end;
$$;

-- Shared helper shape: one activated challenge with a full activation
-- snapshot (finalize_challenge_result and prepare/activate both read real
-- fields off this), plus caller-controlled periods. Session-scoped
-- (pg_temp), so it is created once here and reused by every scenario below
-- in this same file/psql-session.
create or replace function pg_temp.seed_activated_challenge(
  p_owner uuid, p_challenge uuid, p_status text, p_behavior_description text
) returns void language plpgsql as $body$
begin
  insert into public.challenges (
    id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
    timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
  ) values (
    p_challenge, p_owner, null, 1, 1, p_status,
    'Europe/Stockholm', now() - interval '10 days', now() - interval '10 days', now() + interval '4 days',
    jsonb_build_object(
      'id', p_challenge, 'ownerId', p_owner, 'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'A real goal',
      'behavior', jsonb_build_object('description', p_behavior_description, 'completionDefinition', p_behavior_description),
      'duration', jsonb_build_object('unit', 'week', 'value', 2), 'successRule', jsonb_build_object('direction', 'stop', 'ruleVersion', 1),
      'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Mom')),
      'rewardOrganizer', jsonb_build_object('type', 'other', 'name', 'Mom'), 'consequenceCategory', 'wellness',
      'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
      'membershipStatusAtActivation', 'trialing'
    )
  );
  insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
    values (gen_random_uuid(), p_challenge, p_owner, 'active', 5000, 'USD', 'authorized', now() - interval '10 days');
end;
$body$;
reset role;

-- 1. Not yet ended: a real active challenge whose only period's reporting
-- window is still open. reconcile_challenge_lifecycle must be a genuine
-- no-op — the challenge stays 'active', not merely "looks unchanged".
set role service_role;
do $$
declare
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000001';
  v_result text;
begin
  perform pg_temp.seed_activated_challenge('d9999999-0000-0000-0000-000000000001', v_challenge, 'active', 'No unhealthy food');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 1, 'continuous', now() - interval '10 days', now() + interval '4 days', now() + interval '5 days',
      jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));

  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_is_a_noop_before_the_reporting_window_closes', v_result, 'active');
  perform test.assert_equals('reconcile_noop_leaves_the_row_active_in_the_db',
    (select challenge_status from public.challenges where id = v_challenge), 'active');
end;
$$;
reset role;

-- 2. Just ended: the challenge's real reporting window has genuinely
-- closed. reconcile_challenge_lifecycle transitions active -> awaiting_
-- resolution, is idempotent on repeat, closes ordinary check-in, blocks a
-- new challenge from being prepared or activated, and the DB-level
-- invariant itself refuses a second unresolved row even via a direct write.
set role service_role;
do $$
declare
  v_owner uuid := 'd9999999-0000-0000-0000-000000000002';
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000002';
  v_result text;
begin
  perform pg_temp.seed_activated_challenge(v_owner, v_challenge, 'active', 'No unhealthy food');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 1, 'continuous', now() - interval '10 days', now() - interval '2 days', now() - interval '1 day',
      jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));

  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_moves_active_to_awaiting_resolution_once_the_window_closes', v_result, 'awaiting_resolution');
  perform test.assert_equals('reconcile_result_matches_the_persisted_row',
    (select challenge_status from public.challenges where id = v_challenge), 'awaiting_resolution');

  -- Idempotent repeat: the WHERE clause matches nothing the second time,
  -- so the row is left exactly as-is and the function still just reports it.
  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_is_idempotent_on_repeat', v_result, 'awaiting_resolution');

  perform test.assert_fails('check_in_rejected_once_awaiting_resolution',
    format($stmt$select public.append_check_in_event(
      %L::uuid, %L::uuid, (select id from public.challenge_periods where challenge_id = %L::uuid limit 1),
      'stop_intact', jsonb_build_object('kind', 'stop_intact'), 'ios', now(), 'op-completion-lifecycle-1'
    )$stmt$, v_owner, v_challenge, v_challenge),
    '22023');
end;
$$;
reset role;

-- Preparing a brand new draft is rejected while the owner's only challenge
-- is merely awaiting_resolution, not just while it is active — the exact
-- "wait out the clock" loophole this package closes.
set role service_role;
insert into public.challenge_drafts (id, owner_id, schema_version, draft_payload, draft_status) values (
  'e2222222-0000-0000-0000-000000000001', 'd9999999-0000-0000-0000-000000000002', 1,
  jsonb_build_object(
    'schemaVersion', 1, 'id', 'e2222222-0000-0000-0000-000000000001', 'ownerId', 'd9999999-0000-0000-0000-000000000002',
    'goal', 'A new goal after the old one ended',
    'behavior', jsonb_build_object('description', 'Something else', 'completionDefinition', 'Something else',
      'rule', jsonb_build_object('direction', 'build', 'measurement', jsonb_build_object('type', 'completion', 'unit', 'completion'),
        'rhythm', jsonb_build_object('type', 'daily', 'periodUnit', 'day', 'target', 1))),
    'duration', jsonb_build_object('unit', 'week', 'value', 2),
    'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1, 'totalPlannedCompletions', 14, 'minimumRequiredCompletions', 10,
      'continuitySafeguard', jsonb_build_object('type', 'maximum_consecutive_missed_days', 'maximum', 2), 'periodTarget', 1, 'periodUnit', 'day'),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')), 'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'),
    'experienceCategory', 'dinner', 'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
    'invitationMessage', 'Join me.', 'membershipSelection', 'monthly_trial'
  ),
  'ready_for_activation'
);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'd9999999-0000-0000-0000-000000000002', false);
select test.assert_fails('prepare_rejected_while_the_only_challenge_is_awaiting_resolution',
  $stmt$select public.prepare_challenge_from_draft('e2222222-0000-0000-0000-000000000001')$stmt$,
  '22023');
reset role;

-- A second, still-pending challenge for the same owner (inserted directly,
-- mirroring 220's own pattern) is also rejected at activation time while
-- the first sits awaiting_resolution.
set role service_role;
insert into public.challenges (
  id, owner_id, source_draft_id, schema_version, rule_engine_version, challenge_status,
  timezone, activated_at, starts_at, planned_ends_at, activation_snapshot
) values (
  'e1111111-0000-0000-0000-000000000003', 'd9999999-0000-0000-0000-000000000002', null, 1, 1, 'pending_activation',
  'Europe/Stockholm', now(), now(), now() + interval '14 days',
  jsonb_build_object(
    'id', 'e1111111-0000-0000-0000-000000000003', 'ownerId', 'd9999999-0000-0000-0000-000000000002',
    'schemaVersion', 1, 'ruleEngineVersion', 1, 'goal', 'Read more',
    'behavior', jsonb_build_object('description', 'Read before bed', 'completionDefinition', 'Read for 20 minutes'),
    'duration', jsonb_build_object('unit', 'week', 'value', 2), 'successRule', jsonb_build_object('direction', 'build', 'ruleVersion', 1),
    'recipients', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Anna')),
    'rewardOrganizer', jsonb_build_object('type', 'recipient', 'recipientId', 'r1'), 'consequenceCategory', 'dinner',
    'stake', jsonb_build_object('minorUnits', 5000, 'currency', 'USD'), 'sitOutAcknowledged', true,
    'membershipStatusAtActivation', 'trialing'
  )
);
insert into public.consequences (id, challenge_id, owner_id, status, stake_minor_units, currency, authorization_status, authorized_at)
  values (gen_random_uuid(), 'e1111111-0000-0000-0000-000000000003', 'd9999999-0000-0000-0000-000000000002', 'authorized', 5000, 'USD', 'authorized', now());
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'd9999999-0000-0000-0000-000000000002', false);
select test.assert_fails('activation_rejected_while_a_different_challenge_is_awaiting_resolution',
  $stmt$select public.activate_challenge_draft('e1111111-0000-0000-0000-000000000003', 'Europe/Stockholm')$stmt$,
  '22023');
reset role;

-- The decisive invariant: PostgreSQL itself refuses a second active row for
-- an owner who already has one sitting awaiting_resolution, even via a
-- direct write that bypasses every RPC guard.
set role service_role;
select test.assert_fails('db_level_invariant_rejects_active_row_while_owner_has_an_unresolved_one',
  $stmt$update public.challenges set challenge_status = 'active' where id = 'e1111111-0000-0000-0000-000000000003'$stmt$,
  '23505');
reset role;

-- 3. Max-period-governs: a multi-period challenge where the two earlier
-- periods have already closed but the FINAL period has not. Proves the
-- reconciliation compares against the maximum reporting_closes_at across
-- every period, not merely the first or an arbitrary one.
set role service_role;
do $$
declare
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000004';
  v_result text;
begin
  perform pg_temp.seed_activated_challenge('d9999999-0000-0000-0000-000000000003', v_challenge, 'active', 'No unhealthy food');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload) values
    (v_challenge, 1, 'week', now() - interval '14 days', now() - interval '7 days', now() - interval '6 days', jsonb_build_object('type', 'completion_target', 'target', 1)),
    (v_challenge, 2, 'week', now() - interval '7 days', now() - interval '1 day', now() + interval '1 day', jsonb_build_object('type', 'completion_target', 'target', 1));

  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_uses_the_max_reporting_closes_at_not_the_first_period', v_result, 'active');

  -- Now the final period closes too (still comfortably after its own
  -- ends_at, satisfying challenge_periods' reporting_closes_at > ends_at
  -- check): reconciliation genuinely fires.
  update public.challenge_periods set reporting_closes_at = now() - interval '12 hours' where challenge_id = v_challenge and period_number = 2;
  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_fires_once_the_final_periods_own_window_closes_too', v_result, 'awaiting_resolution');
end;
$$;
reset role;

-- 4. A 'superseded' challenge is never touched by reconciliation, even one
-- whose periods are long past their reporting window — reconciliation only
-- ever matches a genuinely 'active' row.
set role service_role;
do $$
declare
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000005';
  v_result text;
begin
  perform pg_temp.seed_activated_challenge('d9999999-0000-0000-0000-000000000004', v_challenge, 'superseded', 'Old goal');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 1, 'continuous', now() - interval '30 days', now() - interval '20 days', now() - interval '19 days',
      jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));

  select public.reconcile_challenge_lifecycle(v_challenge) into v_result;
  perform test.assert_equals('reconcile_never_touches_a_superseded_challenge', v_result, 'superseded');
  perform test.assert_equals('superseded_challenge_row_unchanged_in_the_db',
    (select challenge_status from public.challenges where id = v_challenge), 'superseded');
end;
$$;
reset role;

-- 5. Canonical current-challenge view's defensive time filter: a challenge
-- whose reporting window has genuinely closed but has NOT yet been
-- reconciled (still literally 'active' in the row) must still stop
-- appearing as "current" to Kin. Real reconciliation only ever happens via
-- reconcile_challenge_lifecycle (called from finalize-challenge) — this
-- proves the read side does not depend on that having run yet.
set role service_role;
do $$
declare
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000006';
begin
  perform pg_temp.seed_activated_challenge('d9999999-0000-0000-0000-000000000005', v_challenge, 'active', 'No unhealthy food');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 1, 'continuous', now() - interval '10 days', now() - interval '2 days', now() - interval '1 day',
      jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));
end;
$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'd9999999-0000-0000-0000-000000000007', false);
select test.assert_equals('canonical_view_excludes_an_unreconciled_but_ended_challenge_from_kin',
  (select count(*) from public.get_kin_current_challenges() where challenge_id = 'e1111111-0000-0000-0000-000000000006'), 0::bigint);
reset role;

-- 6. finalize_challenge_result rejects a challenge that is still genuinely
-- 'active' -- it must never evaluate or write a terminal outcome for a
-- challenge whose reporting window has not actually closed.
set role service_role;
do $$
declare
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000007';
begin
  perform pg_temp.seed_activated_challenge('d9999999-0000-0000-0000-000000000006', v_challenge, 'active', 'No unhealthy food');
  insert into public.challenge_periods (challenge_id, period_number, period_kind, starts_at, ends_at, reporting_closes_at, target_payload)
    values (v_challenge, 1, 'continuous', now() - interval '10 days', now() + interval '4 days', now() + interval '5 days',
      jsonb_build_object('type', 'maximum_lapses', 'maximum', 0));

  perform test.assert_fails('finalize_rejects_a_challenge_that_is_still_genuinely_active',
    format($stmt$select public.finalize_challenge_result(
      %L::uuid, %L::uuid, 'completed_failure', 'challenge_failed',
      jsonb_build_object('behavior', jsonb_build_object('description', 'x')), 'challenge_failed:%s'
    )$stmt$, 'd9999999-0000-0000-0000-000000000006', v_challenge, v_challenge),
    '22023');
  perform test.assert_equals('rejected_finalize_leaves_the_challenge_active',
    (select challenge_status from public.challenges where id = v_challenge), 'active');
end;
$$;
reset role;

-- 7. finalize_challenge_result succeeds once genuinely awaiting_resolution
-- (challenge from scenario 2, already reconciled above), is idempotent on
-- repeat with no duplicate social_activity row, and never mutates the
-- consequence record as a side effect of merely finalizing the outcome --
-- the actual charge/fulfillment step remains its own, separately-triggered,
-- still-unbuilt boundary (see this migration's own header notes).
set role service_role;
do $$
declare
  v_owner uuid := 'd9999999-0000-0000-0000-000000000002';
  v_challenge uuid := 'e1111111-0000-0000-0000-000000000002';
  v_dedupe text := 'challenge_failed:e1111111-0000-0000-0000-000000000002';
  v_consequence_status_before text;
  v_consequence_status_after text;
  v_result jsonb;
begin
  select status into v_consequence_status_before from public.consequences where challenge_id = v_challenge;

  select public.finalize_challenge_result(
    v_owner, v_challenge, 'completed_failure', 'challenge_failed',
    jsonb_build_object('behavior', jsonb_build_object('description', 'No unhealthy food'), 'duration', jsonb_build_object('unit', 'week', 'value', 2)),
    v_dedupe
  ) into v_result;
  perform test.assert_equals('finalize_succeeds_once_awaiting_resolution', v_result ->> 'status', 'completed_failure');
  perform test.assert_equals('finalize_result_not_already_finalized_the_first_time', (v_result ->> 'alreadyFinalized')::boolean, false);
  perform test.assert_equals('finalize_persists_the_terminal_status',
    (select challenge_status from public.challenges where id = v_challenge), 'completed_failure');
  perform test.assert_true('finalize_sets_completed_at', (select completed_at from public.challenges where id = v_challenge) is not null);
  perform test.assert_equals('finalize_inserts_exactly_one_social_activity_row',
    (select count(*) from public.social_activity where owner_id = v_owner and dedupe_key = v_dedupe), 1::bigint);

  select status into v_consequence_status_after from public.consequences where challenge_id = v_challenge;
  perform test.assert_equals('finalize_never_mutates_the_consequence_record_as_a_side_effect',
    v_consequence_status_after, v_consequence_status_before);

  -- Idempotent repeat: same dedupe key, no second social_activity row, and
  -- the response says so honestly rather than silently no-op'ing.
  select public.finalize_challenge_result(
    v_owner, v_challenge, 'completed_failure', 'challenge_failed',
    jsonb_build_object('behavior', jsonb_build_object('description', 'No unhealthy food'), 'duration', jsonb_build_object('unit', 'week', 'value', 2)),
    v_dedupe
  ) into v_result;
  perform test.assert_equals('finalize_repeat_call_reports_already_finalized', (v_result ->> 'alreadyFinalized')::boolean, true);
  perform test.assert_equals('finalize_repeat_call_does_not_duplicate_the_social_activity_row',
    (select count(*) from public.social_activity where owner_id = v_owner and dedupe_key = v_dedupe), 1::bigint);
end;
$$;
reset role;

-- RLS: reconcile_challenge_lifecycle is a service-role-only internal step,
-- exactly like append_check_in_event's own RPC boundary -- never directly
-- callable by anon or authenticated, so a client can never force a
-- reconciliation (or probe its timing) outside the trusted Edge Function.
set role anon;
select test.assert_fails('anon_cannot_call_reconcile_challenge_lifecycle',
  format('select public.reconcile_challenge_lifecycle(%L::uuid)', 'e1111111-0000-0000-0000-000000000001'), '42501');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'd9999999-0000-0000-0000-000000000001', false);
select test.assert_fails('authenticated_cannot_call_reconcile_challenge_lifecycle',
  format('select public.reconcile_challenge_lifecycle(%L::uuid)', 'e1111111-0000-0000-0000-000000000001'), '42501');
reset role;
