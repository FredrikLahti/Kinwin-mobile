/** Real local Edge Runtime coverage for the service-only scheduled worker. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secretKey = process.env.SECRET_KEY;
if (!url || !anonKey || !serviceKey || !secretKey) throw new Error('local Supabase environment is required');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function seedEndedBuildChallenge(withCompletion: boolean) {
  const challengeId = randomUUID();
  const periodId = randomUUID();
  const email = `scheduled-${randomUUID()}@kinwin-e2e.test`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password: randomUUID(), email_confirm: true });
  assert.equal(userError, null, `user fixture failed: ${userError?.message}`);
  const createdUser = created.user;
  assert.ok(createdUser);

  const now = Date.now();
  const startsAt = new Date(now - 3 * 86_400_000).toISOString();
  const endsAt = new Date(now - 2 * 86_400_000).toISOString();
  const reportingClosesAt = new Date(now - 86_400_000).toISOString();
  const snapshot = {
    id: challengeId,
    ownerId: createdUser.id,
    schemaVersion: 1,
    ruleEngineVersion: 1,
    goal: 'Exercise the scheduled worker',
    behavior: { description: 'Read daily', completionDefinition: 'Read once' },
    duration: { unit: 'week', value: 1 },
    successRule: {
      direction: 'build', ruleVersion: 1, totalPlannedCompletions: 1, minimumRequiredCompletions: 1,
      continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 0 },
      periodTarget: 1, periodUnit: 'day',
    },
    recipients: [{ id: 'recipient-1', name: 'Mom' }],
    rewardOrganizer: { type: 'recipient', recipientId: 'recipient-1' },
    consequenceCategory: 'wellness',
    stake: { minorUnits: 5000, currency: 'USD' },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'trialing',
  };

  const { error: challengeError } = await admin.from('challenges').insert({
    id: challengeId,
    owner_id: createdUser.id,
    schema_version: 1,
    rule_engine_version: 1,
    challenge_status: 'active',
    timezone: 'Europe/Stockholm',
    activated_at: startsAt,
    starts_at: startsAt,
    planned_ends_at: endsAt,
    activation_snapshot: snapshot,
  });
  assert.equal(challengeError, null, `challenge fixture failed: ${challengeError?.message}`);
  const { error: consequenceError } = await admin.from('consequences').insert({
    challenge_id: challengeId,
    owner_id: createdUser.id,
    status: 'active',
    stake_minor_units: 5000,
    currency: 'USD',
    authorization_status: 'authorized',
    authorized_at: startsAt,
  });
  assert.equal(consequenceError, null, `consequence fixture failed: ${consequenceError?.message}`);
  const { error: periodError } = await admin.from('challenge_periods').insert({
    id: periodId,
    challenge_id: challengeId,
    period_number: 1,
    period_kind: 'day',
    starts_at: startsAt,
    ends_at: endsAt,
    reporting_closes_at: reportingClosesAt,
    target_payload: { type: 'completion_target', target: 1 },
  });
  assert.equal(periodError, null, `period fixture failed: ${periodError?.message}`);
  if (withCompletion) {
    const { error: eventError } = await admin.from('check_in_events').insert({
      challenge_id: challengeId,
      owner_id: createdUser.id,
      period_id: periodId,
      event_type: 'build_completion',
      event_payload: { kind: 'build_completion', completions: 1 },
      source: 'server',
      client_recorded_at: endsAt,
      server_recorded_at: endsAt,
      idempotency_key: `scheduled-${challengeId}`,
    });
    assert.equal(eventError, null, `event fixture failed: ${eventError?.message}`);
  }
  return challengeId;
}

async function invokeWorker(key: string) {
  return fetch(`${url}/functions/v1/scheduled-finalize-challenges`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'e2e' }),
  });
}

test('scheduled worker finalizes success/failure without user JWT and remains idempotent', async () => {
  const successId = await seedEndedBuildChallenge(true);
  const failureId = await seedEndedBuildChallenge(false);

  const unauthorized = await invokeWorker(anonKey);
  assert.equal(unauthorized.status, 401);

  const legacyServiceRoleCredential = await invokeWorker(serviceKey);
  assert.equal(legacyServiceRoleCredential.status, 401);

  const first = await invokeWorker(secretKey);
  assert.equal(first.status, 200, await first.text());

  const { data: challenges, error: challengeError } = await admin
    .from('challenges')
    .select('id, challenge_status')
    .in('id', [successId, failureId]);
  assert.equal(challengeError, null);
  assert.equal(challenges?.find((row) => row.id === successId)?.challenge_status, 'completed_success');
  assert.equal(challenges?.find((row) => row.id === failureId)?.challenge_status, 'completed_failure');

  const second = await invokeWorker(secretKey);
  assert.equal(second.status, 200, await second.text());
  const { data: events, error: eventError } = await admin
    .from('social_activity')
    .select('challenge_id, kind')
    .in('challenge_id', [successId, failureId]);
  assert.equal(eventError, null);
  assert.equal(events?.filter((row) => row.challenge_id === successId && row.kind === 'challenge_succeeded').length, 1);
  assert.equal(events?.filter((row) => row.challenge_id === failureId && row.kind === 'challenge_failed').length, 1);

  const { data: consequences, error: consequenceError } = await admin
    .from('consequences')
    .select('challenge_id, status')
    .in('challenge_id', [successId, failureId]);
  assert.equal(consequenceError, null);
  assert.ok(consequences?.every((row) => row.status === 'active'), 'outcome finalization must not start charging or fulfillment');
});

test('fulfillment worker is service-secret scoped and fails truthfully without sandbox credentials', async () => {
  const invoke = (key: string) => fetch(`${url}/functions/v1/scheduled-fulfill-rewards`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal((await invoke(anonKey)).status, 401);
  assert.equal((await invoke(serviceKey)).status, 401);
  const configuredBoundary = await invoke(secretKey);
  assert.equal(configuredBoundary.status, 503);
  assert.deepEqual(await configuredBoundary.json(), { error: 'sandbox_not_configured' });

  const reconcile = (key: string) => fetch(`${url}/functions/v1/scheduled-reconcile-rewards`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal((await reconcile(anonKey)).status, 401);
  assert.equal((await reconcile(serviceKey)).status, 401);
  const reconciliationBoundary = await reconcile(secretKey);
  assert.equal(reconciliationBoundary.status, 503);
  assert.deepEqual(await reconciliationBoundary.json(), { error: 'sandbox_not_configured' });
});
