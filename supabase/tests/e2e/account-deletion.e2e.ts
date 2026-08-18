/**
 * Real GoTrue + PostgREST + Edge Runtime end-to-end coverage for account
 * deletion: public.check_account_deletion_eligibility,
 * private.delete_account_owned_data, and the delete-account Edge Function
 * (supabase/migrations/20260903000000_account_deletion.sql,
 * supabase/functions/delete-account/index.ts). See
 * docs/ACCOUNT_DELETION_DECISIONS.md for the product decisions this
 * proves.
 *
 * Most fixtures here are built with direct service-role inserts (the same
 * proven pattern recipient-invitation.e2e.ts already uses for a
 * challenge_status: 'active' fixture) rather than driving the full
 * draft -> prepare -> activate -> finalize -> charge -> reward RPC chain —
 * those RPCs already have their own dedicated test coverage elsewhere;
 * this suite's job is proving the *deletion* boundary handles every
 * resulting state correctly, not re-proving how a challenge gets there.
 * The two scenarios that specifically exercise the real self-service
 * product flow (a pending commitment blocking deletion, and canceling one
 * to reach a real terminal state) use the real RPCs, since those are
 * simple, already well covered, and worth exercising end to end here too.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { mapOnboardingDraft, OnboardingDraftData } from '../../../domain/challenge/from-onboarding-draft';
import { resolveRecipientIds } from '../../../domain/challenge/recipient-ids';
import type { ChallengeDraftId, UserId } from '../../../domain/challenge/types';
import { planDraftMutation } from '../../../lib/supabase/draft-mutation';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_DB_URL) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_DB_URL (all from `supabase status -o env` ' +
      'against a running `supabase start`) must be set. This suite talks to a real local GoTrue/PostgREST/Edge-Runtime ' +
      'stack and refuses to run without it — no mocked backend.',
  );
}

/**
 * Direct SQL against the real local `supabase start` Postgres database —
 * the only way to reach `private.consequence_charge_attempts` /
 * `private.reward_fulfillments` for fixture setup, since PostgREST
 * deliberately never exposes the `private` schema (config.toml's
 * `api.schemas`, proven from the other direction by this file's own
 * "public.delete_account_owned_data stays unreachable" test below and by
 * server-generated-periods.e2e.ts). This is fixture plumbing for a test —
 * the same effect a service-role Postgres connection already has — never a
 * new production RPC or a widening of what PostgREST exposes. Uses the same
 * psql-over-stdin mechanism as supabase/tests/run.sh.
 */
function runFixtureSql(sql: string): void {
  execFileSync('psql', [SUPABASE_DB_URL as string, '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

/** Same as runFixtureSql, but for a single scalar (e.g. a `count(*)`), returned as trimmed text. */
function fixtureSqlScalar(sql: string): string {
  return execFileSync('psql', [SUPABASE_DB_URL as string, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
    input: sql,
    encoding: 'utf8',
  }).trim();
}

function freshClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function serviceRoleClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function testEmail(label: string) {
  return `${label}-${randomUUID()}@kinwin-e2e.test`;
}

const PASSWORD = 'correct horse battery staple';

async function signUpAndSignIn(email: string) {
  const client = freshClient();
  const signUp = await client.auth.signUp({ email, password: PASSWORD });
  assert.equal(signUp.error, null, `signUp failed: ${signUp.error?.message}`);
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(signIn.error, null, `signInWithPassword failed: ${signIn.error?.message}`);
  assert.ok(signIn.data.session, 'signInWithPassword did not return a session');
  return { client, email, userId: signIn.data.session!.user.id };
}

function buildOnboardingData(recipientLocalId: string): OnboardingDraftData {
  return {
    goal: 'Sleep better',
    behaviorText: 'Strength train',
    definitionText: 'Complete the planned session',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    recipients: [{ id: recipientLocalId, name: 'Anna' }],
    rewardOrganizer: { type: 'recipient', recipientId: recipientLocalId },
    experienceCategory: 'dinner',
    stakeAmount: 75,
    currency: 'USD',
    sitOutAcknowledged: true,
    invitationMessage: 'Join me in this promise.',
    membershipChoice: 'monthly_trial',
    successThresholdOverride: null,
  };
}

/** Saves a complete draft and prepares it into a real pending commitment (real RPC path), mirroring pending-commitment.e2e.ts. */
async function createPendingCommitment(client: ReturnType<typeof freshClient>, ownerId: string): Promise<{ challengeId: string; recipientId: string }> {
  const localRecipientId = 'recipient-local-1';
  const draftId = randomUUID();
  const recipientIds = resolveRecipientIds([{ id: localRecipientId, name: 'Anna' }], () => randomUUID());
  const mapped = mapOnboardingDraft(buildOnboardingData(localRecipientId), {
    draftId: draftId as ChallengeDraftId,
    ownerId: ownerId as UserId,
    recipientIds,
  });
  assert.equal(mapped.ok, true, 'fixture must map to a valid draft');
  if (!mapped.ok) throw new Error('unreachable');
  const plan = planDraftMutation(null, draftId, ownerId, mapped.value);
  assert.equal(plan.kind, 'insert');
  if (plan.kind !== 'insert') throw new Error('unreachable');
  const { error: insertError } = await client.from('challenge_drafts').insert(plan.row);
  assert.equal(insertError, null, `draft insert failed: ${insertError?.message}`);
  const { data, error } = await client.rpc('prepare_challenge_from_draft', { draft_id: draftId });
  assert.equal(error, null, `prepare_challenge_from_draft failed: ${error?.message}`);
  const { data: recipient } = await client.from('challenge_recipients').select('id').eq('challenge_id', data.challengeId).single();
  return { challengeId: data.challengeId as string, recipientId: recipient!.id as string };
}

function activationSnapshot(challengeId: string, ownerId: string, recipientId: string) {
  return {
    schemaVersion: 1,
    id: challengeId,
    ownerId,
    ruleEngineVersion: 1,
    goal: 'Feel stronger',
    behavior: { description: 'Morning run', completionDefinition: 'Complete a run' },
    duration: { unit: 'week', value: 2 },
    successRule: { direction: 'build', ruleVersion: 1 },
    recipients: [{ id: recipientId, name: 'Anna' }],
    rewardOrganizer: { type: 'other', name: 'Alex' },
    consequenceCategory: 'dinner',
    stake: { minorUnits: 5000, currency: 'USD' },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'trialing',
  };
}

/**
 * Directly inserts an already-terminal challenge (bypassing the real
 * draft/prepare/activate/finalize chain — see file header). `challengeStatus`
 * must be a terminal-shaped status ('completed_success' or
 * 'completed_failure') so the activation-fields CHECK constraint is
 * satisfied. Returns the ids needed to attach further fixtures
 * (consequence_id for the payment/reward scenarios).
 */
async function insertTerminalChallenge(
  service: ReturnType<typeof serviceRoleClient>,
  ownerId: string,
  challengeStatus: 'completed_success' | 'completed_failure',
): Promise<{ challengeId: string; consequenceId: string; recipientId: string }> {
  const challengeId = randomUUID();
  const recipientId = randomUUID();
  const consequenceId = randomUUID();
  const now = new Date().toISOString();

  const { error: challengeError } = await service.from('challenges').insert({
    id: challengeId,
    owner_id: ownerId,
    schema_version: 1,
    rule_engine_version: 1,
    challenge_status: challengeStatus,
    timezone: 'UTC',
    activated_at: now,
    starts_at: now,
    planned_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    completed_at: now,
    activation_snapshot: activationSnapshot(challengeId, ownerId, recipientId),
  });
  assert.equal(challengeError, null, `fixture challenge insert failed: ${challengeError?.message}`);

  const { error: recipientError } = await service.from('challenge_recipients').insert({
    id: recipientId,
    challenge_id: challengeId,
    display_name: 'Anna',
    sort_order: 0,
  });
  assert.equal(recipientError, null, `fixture recipient insert failed: ${recipientError?.message}`);

  const { error: consequenceError } = await service.from('consequences').insert({
    id: consequenceId,
    challenge_id: challengeId,
    owner_id: ownerId,
    status: 'payment_method_required',
    stake_minor_units: 5000,
    currency: 'USD',
  });
  assert.equal(consequenceError, null, `fixture consequence insert failed: ${consequenceError?.message}`);

  return { challengeId, consequenceId, recipientId };
}

function insertSucceededChargeAttempt(ownerId: string, consequenceId: string) {
  const now = new Date().toISOString();
  runFixtureSql(`
    insert into private.consequence_charge_attempts (
      consequence_id, owner_id, idempotency_key, attempt_number, status,
      amount_minor_units, currency, requested_at, completed_at,
      stripe_customer_id, stripe_payment_method_id, stripe_payment_intent_id
    ) values (
      '${consequenceId}', '${ownerId}', 'e2e-charge-${randomUUID()}', 1, 'succeeded',
      5000, 'USD', '${now}', '${now}',
      'cus_e2e_${randomUUID()}', 'pm_e2e_${randomUUID()}', 'pi_e2e_${randomUUID()}'
    );
  `);
}

function insertDeliveredReward(consequenceId: string) {
  const now = new Date().toISOString();
  runFixtureSql(`
    insert into private.reward_fulfillments (
      consequence_id, idempotency_key, fulfillment_provider, status,
      amount_minor_units, currency, requested_at, delivered_at,
      provider_status, provider_order_id, provider_reward_id
    ) values (
      '${consequenceId}', 'e2e-reward-${randomUUID()}', 'tremendous_sandbox', 'delivered',
      5000, 'USD', '${now}', '${now}',
      'SUCCEEDED', 'order_e2e_${randomUUID()}', 'reward_e2e_${randomUUID()}'
    );
  `);
}

function countPrivateRows(table: 'consequence_charge_attempts' | 'reward_fulfillments', consequenceId: string): number {
  return Number(fixtureSqlScalar(`select count(*) from private.${table} where consequence_id = '${consequenceId}';`));
}

async function callDeleteAccount(accessToken: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function profileExists(service: ReturnType<typeof serviceRoleClient>, ownerId: string): Promise<boolean> {
  const { data } = await service.from('profiles').select('id').eq('id', ownerId).maybeSingle();
  return data !== null;
}

test('account deletion: anonymous callers are rejected', async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY as string, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 401, 'an unauthenticated call must be rejected');
});

test('account deletion: an active challenge blocks deletion, and only ever affects the caller\'s own account', async (t) => {
  const service = serviceRoleClient();
  let ownerA = '';
  let clientA: ReturnType<typeof freshClient>;
  let accessTokenA = '';
  let challengeIdA = '';
  let draftIdA = '';

  await t.test('User A prepares a real pending commitment', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-a'));
    ownerA = signed.userId;
    clientA = signed.client;
    accessTokenA = (await signed.client.auth.getSession()).data.session!.access_token;
    const commitment = await createPendingCommitment(signed.client, ownerA);
    challengeIdA = commitment.challengeId;
    const { data: challenge } = await signed.client.from('challenges').select('source_draft_id').eq('id', challengeIdA).single();
    draftIdA = challenge!.source_draft_id as string;
  });

  await t.test('User B (unrelated, empty account) deletes their own account without touching User A', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-b'));
    const { data, error } = await signed.client.rpc('check_account_deletion_eligibility');
    assert.equal(error, null);
    assert.equal(data.eligible, true, 'an account with nothing on it must be eligible');

    const result = await callDeleteAccount((await signed.client.auth.getSession()).data.session!.access_token);
    assert.equal(result.status, 200, `expected User B's deletion to succeed: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.deleted, true);
    assert.equal(await profileExists(service, signed.userId), false, 'User B\'s profile must be gone');

    const { data: challengeA } = await service.from('challenges').select('id').eq('id', challengeIdA).maybeSingle();
    assert.ok(challengeA, 'User A\'s challenge must be completely untouched by User B\'s deletion');
  });

  await t.test('User A\'s own preflight is blocked by their own non-terminal challenge', async () => {
    const { data, error } = await clientA.rpc('check_account_deletion_eligibility');
    assert.equal(error, null);
    assert.deepEqual(data, { eligible: false, reason: 'active_challenge' });
  });

  await t.test('User A\'s own deletion attempt is also rejected server-side, never trusting a client-side preflight alone', async () => {
    const result = await callDeleteAccount(accessTokenA);
    assert.equal(result.status, 409, `expected a blocked deletion: ${JSON.stringify(result.body)}`);
    assert.deepEqual(result.body, { error: 'ineligible', message: 'active_challenge' });

    const { data: draft } = await service.from('challenge_drafts').select('id').eq('id', draftIdA).maybeSingle();
    assert.ok(draft, 'a rejected deletion attempt must not touch anything');
    assert.equal(await profileExists(service, ownerA), true, 'User A\'s profile must still exist after the rejected attempt');
  });
});

test('account deletion: a fully terminal account (canceled commitment, Playbook, Kin, an invitation) deletes completely', async (t) => {
  const service = serviceRoleClient();
  let ownerId = '';
  let client: ReturnType<typeof freshClient>;
  let email = '';
  let challengeId = '';
  let recipientId = '';
  let draftId = '';

  await t.test('setup: a pending commitment, canceled to a real terminal state', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-terminal'));
    ownerId = signed.userId;
    client = signed.client;
    email = signed.email;
    const commitment = await createPendingCommitment(signed.client, ownerId);
    challengeId = commitment.challengeId;
    recipientId = commitment.recipientId;
    const { data: challenge } = await signed.client.from('challenges').select('source_draft_id').eq('id', challengeId).single();
    draftId = challenge!.source_draft_id as string;

    const { error: cancelError } = await signed.client.rpc('cancel_pending_challenge', { challenge_id: challengeId });
    assert.equal(cancelError, null, `cancel_pending_challenge failed: ${cancelError?.message}`);

    // The trigger-created canonical reward organizer must exist (proves
    // the archived-draft/reward-organizer trigger-bypass path in
    // delete_account_owned_data is genuinely exercised below, not a no-op).
    const { data: organizer } = await service.from('challenge_reward_organizers').select('id').eq('challenge_id', challengeId).maybeSingle();
    assert.ok(organizer, 'expected a canonical reward organizer to already exist for this prepared challenge');
  });

  await t.test('setup: a Playbook entry, a Kin request, and an accepted-recipient invitation', async () => {
    const { error: playbookError } = await client.from('playbook_entries').insert({
      owner_id: ownerId,
      category: 'lesson',
      content: 'Small steps compound.',
    });
    assert.equal(playbookError, null, `playbook entry insert failed: ${playbookError?.message}`);

    const kinTarget = await signUpAndSignIn(testEmail('deletion-terminal-kin-target'));
    const { error: kinError } = await client.rpc('send_kin_request', { p_user_id: kinTarget.userId });
    assert.equal(kinError, null, `send_kin_request failed: ${kinError?.message}`);

    const { error: invitationError } = await client.functions.invoke('create-recipient-invitation', { body: { recipientId } });
    assert.equal(invitationError, null, `create-recipient-invitation failed: ${invitationError?.message}`);
  });

  await t.test('preflight reports eligible', async () => {
    const { data, error } = await client.rpc('check_account_deletion_eligibility');
    assert.equal(error, null);
    assert.deepEqual(data, { eligible: true });
  });

  await t.test('deletion succeeds and removes the entire owned graph', async () => {
    const accessToken = (await client.auth.getSession()).data.session!.access_token;
    const result = await callDeleteAccount(accessToken);
    assert.equal(result.status, 200, `expected deletion to succeed: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.deleted, true);

    const checks: Array<[string, string, string]> = [
      ['challenges', 'id', challengeId],
      ['challenge_recipients', 'challenge_id', challengeId],
      ['challenge_reward_organizers', 'challenge_id', challengeId],
      ['consequences', 'challenge_id', challengeId],
      ['challenge_drafts', 'id', draftId],
      ['invitations', 'challenge_id', challengeId],
      ['playbook_entries', 'owner_id', ownerId],
      ['kin_connections', 'requester_id', ownerId],
      ['profiles', 'id', ownerId],
    ];
    for (const [table, column, value] of checks) {
      const { data } = await service.from(table).select('id').eq(column, value);
      assert.equal(data?.length, 0, `expected ${table} to have no rows referencing ${column}=${value} after deletion`);
    }
  });

  await t.test('the account can no longer sign in', async () => {
    const anon = freshClient();
    const { error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ok(error, 'expected sign-in to fail for a deleted account');
  });
});

test('account deletion: check-in history (including a correction) is removed via the leaf-first delete', async (t) => {
  const service = serviceRoleClient();
  let ownerId = '';
  let client: ReturnType<typeof freshClient>;
  let challengeId = '';

  await t.test('setup: a completed_success challenge with a check-in and a correction of it', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-checkins'));
    ownerId = signed.userId;
    client = signed.client;
    const fixture = await insertTerminalChallenge(service, ownerId, 'completed_success');
    challengeId = fixture.challengeId;

    const periodId = randomUUID();
    const { error: periodError } = await service.from('challenge_periods').insert({
      id: periodId,
      challenge_id: challengeId,
      period_number: 1,
      period_kind: 'day',
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 86400000).toISOString(),
      reporting_closes_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      target_payload: { note: 'e2e' },
    });
    assert.equal(periodError, null, `fixture period insert failed: ${periodError?.message}`);

    const originalEventId = randomUUID();
    const { error: eventError } = await service.from('check_in_events').insert({
      id: originalEventId,
      challenge_id: challengeId,
      owner_id: ownerId,
      period_id: periodId,
      event_type: 'build_completion',
      event_payload: { completions: 1 },
      source: 'server',
      client_recorded_at: new Date().toISOString(),
    });
    assert.equal(eventError, null, `fixture check-in insert failed: ${eventError?.message}`);

    const { error: correctionError } = await service.from('check_in_events').insert({
      challenge_id: challengeId,
      owner_id: ownerId,
      period_id: periodId,
      event_type: 'correction',
      event_payload: { completions: 2 },
      source: 'server',
      client_recorded_at: new Date().toISOString(),
      correction_of_event_id: originalEventId,
    });
    assert.equal(correctionError, null, `fixture correction insert failed: ${correctionError?.message}`);
  });

  await t.test('deletion succeeds and removes both check-in rows and the period', async () => {
    const accessToken = (await client.auth.getSession()).data.session!.access_token;
    const result = await callDeleteAccount(accessToken);
    assert.equal(result.status, 200, `expected deletion to succeed: ${JSON.stringify(result.body)}`);

    const { data: events } = await service.from('check_in_events').select('id').eq('challenge_id', challengeId);
    assert.equal(events?.length, 0, 'expected both the original and correction check-in rows to be gone');
    const { data: periods } = await service.from('challenge_periods').select('id').eq('challenge_id', challengeId);
    assert.equal(periods?.length, 0);
  });
});

test('account deletion: an unresolved failed-challenge payment blocks deletion', async (t) => {
  const service = serviceRoleClient();
  let client: ReturnType<typeof freshClient>;

  await t.test('setup: a completed_failure challenge with no charge attempt yet', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-payment-pending'));
    client = signed.client;
    await insertTerminalChallenge(service, signed.userId, 'completed_failure');
  });

  await t.test('preflight and the real deletion call both reject it, for the same reason', async () => {
    const { data } = await client.rpc('check_account_deletion_eligibility');
    assert.deepEqual(data, { eligible: false, reason: 'payment_recovery_pending' });

    const result = await callDeleteAccount((await client.auth.getSession()).data.session!.access_token);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: 'ineligible', message: 'payment_recovery_pending' });
  });
});

test('account deletion: an outstanding reward fulfillment blocks deletion even once the payment itself succeeded', async (t) => {
  const service = serviceRoleClient();
  let client: ReturnType<typeof freshClient>;

  await t.test('setup: a completed_failure challenge with a succeeded charge but no reward fulfillment yet', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-reward-pending'));
    client = signed.client;
    const fixture = await insertTerminalChallenge(service, signed.userId, 'completed_failure');
    insertSucceededChargeAttempt(signed.userId, fixture.consequenceId);
  });

  await t.test('preflight and the real deletion call both reject it, for the same reason', async () => {
    const { data } = await client.rpc('check_account_deletion_eligibility');
    assert.deepEqual(data, { eligible: false, reason: 'reward_fulfillment_pending' });

    const result = await callDeleteAccount((await client.auth.getSession()).data.session!.access_token);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: 'ineligible', message: 'reward_fulfillment_pending' });
  });
});

test('account deletion: a fully resolved failed challenge (paid, reward delivered) can delete, removing the whole financial graph', async (t) => {
  const service = serviceRoleClient();
  let ownerId = '';
  let client: ReturnType<typeof freshClient>;
  let challengeId = '';
  let consequenceId = '';

  await t.test('setup: completed_failure, charge succeeded, reward delivered', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-resolved'));
    ownerId = signed.userId;
    client = signed.client;
    const fixture = await insertTerminalChallenge(service, ownerId, 'completed_failure');
    challengeId = fixture.challengeId;
    consequenceId = fixture.consequenceId;
    insertSucceededChargeAttempt(ownerId, consequenceId);
    insertDeliveredReward(consequenceId);
  });

  await t.test('preflight reports eligible, and deletion removes the entire financial graph', async () => {
    const { data } = await client.rpc('check_account_deletion_eligibility');
    assert.deepEqual(data, { eligible: true });

    const result = await callDeleteAccount((await client.auth.getSession()).data.session!.access_token);
    assert.equal(result.status, 200, `expected deletion to succeed: ${JSON.stringify(result.body)}`);

    const { data: challengeRows } = await service.from('challenges').select('id').eq('id', challengeId);
    assert.equal(challengeRows?.length, 0, 'expected challenges to be empty after deletion');
    const { data: consequenceRows } = await service.from('consequences').select('id').eq('challenge_id', challengeId);
    assert.equal(consequenceRows?.length, 0, 'expected consequences to be empty after deletion');
    assert.equal(countPrivateRows('consequence_charge_attempts', consequenceId), 0, 'expected the charge attempt to be gone');
    assert.equal(countPrivateRows('reward_fulfillments', consequenceId), 0, 'expected the reward fulfillment to be gone');
    assert.equal(await profileExists(service, ownerId), false);
  });
});

test('account deletion: concurrent double-tap does not produce unsafe partial state', async () => {
  const service = serviceRoleClient();
  const signed = await signUpAndSignIn(testEmail('deletion-double-tap'));
  const accessToken = (await signed.client.auth.getSession()).data.session!.access_token;

  const [first, second] = await Promise.all([callDeleteAccount(accessToken), callDeleteAccount(accessToken)]);

  for (const result of [first, second]) {
    assert.ok(result.status === 200 || result.status === 409, `neither concurrent call should crash: got ${result.status} ${JSON.stringify(result.body)}`);
  }
  assert.ok(first.status === 200 || second.status === 200, 'at least one of the two concurrent calls must succeed');
  assert.equal(await profileExists(service, signed.userId), false, 'the account must end up fully deleted regardless of which call "won"');
});

test('public.delete_account_owned_data stays unreachable to anon/authenticated over real PostgREST — only the delete-account Edge Function\'s service-role client can call it', async (t) => {
  await t.test('an anonymous (signed-out) client cannot reach it', async () => {
    const anon = freshClient();
    const { data, error } = await anon.rpc('delete_account_owned_data', { p_owner_id: randomUUID() });
    assert.ok(error, 'expected the destructive RPC to be unreachable to an anonymous client');
    assert.equal(data, null);
  });

  await t.test('a real signed-up, signed-in GoTrue user cannot reach it either, even for their own id', async () => {
    const signed = await signUpAndSignIn(testEmail('deletion-rpc-unreachable'));
    const { data, error } = await signed.client.rpc('delete_account_owned_data', { p_owner_id: signed.userId });
    assert.ok(error, 'expected the destructive RPC to be unreachable even to an authenticated client calling it for their own account');
    assert.equal(data, null);
    assert.equal(await profileExists(serviceRoleClient(), signed.userId), true, 'the account must be completely untouched by the rejected call');
  });
});
