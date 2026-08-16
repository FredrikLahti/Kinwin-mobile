/**
 * Real GoTrue + PostgREST + Edge Runtime end-to-end coverage for the two
 * newest trusted boundaries: `public.activate_challenge_draft`
 * (supabase/migrations/20260811000000_full_activation.sql) and the
 * append-check-in-event Edge Function
 * (supabase/functions/append-check-in-event, backed by
 * supabase/migrations/20260812000000_check_in_append.sql). The layer
 * supabase/tests/150_full_activation.sql / 160_check_in_append.sql (native
 * PostgreSQL, roles impersonated via SET ROLE) cannot reach: real JWT
 * issuance, PostgREST's own RPC handling for activation, and the real Edge
 * Runtime HTTP path for check-in — including that the Edge Function's copy
 * of the domain check-in engine (supabase/functions/_shared/check-in-engine/)
 * actually behaves correctly when Deno really runs it, not just that it
 * typechecks. Run only in CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 *
 * No real Stripe call is involved: reaching `authorization_status =
 * 'authorized'` for real requires a real Stripe test-mode SetupIntent,
 * which ordinary CI's placeholder secrets cannot produce (see
 * consequence-setup-stripe.e2e.ts's own header comment — that suite already
 * covers the real webhook-verification path). This suite's own job is
 * activation's *own* gate and the check-in round trip, not a second proof
 * of Stripe webhook verification, so it simulates "a verified webhook
 * already authorized this" with a direct service-role update instead of
 * re-driving that flow.
 */
import assert from 'node:assert/strict';
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (all from `supabase status -o env` against a ' +
      'running `supabase start`) must be set. This suite talks to a real local GoTrue/PostgREST/Edge-Runtime stack ' +
      'and refuses to run without it — no mocked backend.',
  );
}

function freshClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Local-dev-only key (see the workflow's own comment) — used exclusively to
// simulate the one thing no client-facing RPC will ever do: mark a
// consequence authorized without a real verified webhook.
function serviceRoleClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function testEmail(label: string) {
  return `${label}-${randomUUID()}@kinwin-e2e.test`;
}

const PASSWORD = 'correct horse battery staple';

async function signUpAndSignIn(client: ReturnType<typeof freshClient>, email: string) {
  const signUp = await client.auth.signUp({ email, password: PASSWORD });
  assert.equal(signUp.error, null, `signUp failed: ${signUp.error?.message}`);
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(signIn.error, null, `signInWithPassword failed: ${signIn.error?.message}`);
  assert.ok(signIn.data.session, 'signInWithPassword did not return a session');
  return { userId: signIn.data.session!.user.id };
}

// A simple binary daily Build promise — the one shape that reduces to a
// single "Yes" check-in per period, keeping this suite's focus on
// activation/check-in plumbing rather than re-exercising every direction's
// rule shape (already covered by domain/challenge's own unit tests).
function buildOnboardingData(recipientLocalId: string): OnboardingDraftData {
  return {
    goal: 'Feel stronger',
    behaviorText: 'Morning run',
    definitionText: 'Complete a run',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 2,
    recipients: [{ id: recipientLocalId, name: 'Anna' }],
    rewardOrganizer: { type: 'recipient', recipientId: recipientLocalId },
    experienceCategory: 'dinner',
    stakeAmount: 50,
    currency: 'USD',
    sitOutAcknowledged: true,
    invitationMessage: 'Join me in this promise.',
    membershipChoice: 'monthly_trial',
  };
}

async function createPendingCommitment(client: ReturnType<typeof freshClient>, ownerId: string): Promise<{ challengeId: string }> {
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
  return { challengeId: data.challengeId };
}

test('activate_challenge_draft + append-check-in-event: real activation and a real persisted check-in', async (t) => {
  const service = serviceRoleClient();

  const ownerA = freshClient();
  let userIdA = '';
  let challengeId = '';
  await t.test('User A signs up and prepares a real pending commitment', async () => {
    userIdA = (await signUpAndSignIn(ownerA, testEmail('activation-owner-a'))).userId;
    challengeId = (await createPendingCommitment(ownerA, userIdA)).challengeId;
  });

  await t.test('activation is rejected before payment is authorized', async () => {
    const { data, error } = await ownerA.rpc('activate_challenge_draft', {
      challenge_id: challengeId,
      activation_timezone: 'Europe/Stockholm',
    });
    assert.ok(error, 'expected activation to be rejected without a verified payment authorization');
    assert.equal(data, null);

    const { data: challenge } = await ownerA.from('challenges').select('challenge_status').eq('id', challengeId).single();
    assert.equal(challenge!.challenge_status, 'pending_activation', 'a rejected activation attempt must not change challenge status');
  });

  await t.test('(test setup) simulate a verified webhook having authorized payment', async () => {
    const { error } = await service
      .from('consequences')
      .update({ authorization_status: 'authorized', authorized_at: new Date().toISOString() })
      .eq('challenge_id', challengeId);
    assert.equal(error, null, `service-role authorization update failed: ${error?.message}`);
  });

  await t.test('activation succeeds once payment is authorized, and generates real periods with a real reporting window', async () => {
    const { data, error } = await ownerA.rpc('activate_challenge_draft', {
      challenge_id: challengeId,
      activation_timezone: 'Europe/Stockholm',
    });
    assert.equal(error, null, `activate_challenge_draft failed: ${error?.message}`);
    assert.equal(data.status, 'active');
    assert.ok(data.startsAt, 'expected a startsAt in the RPC response');

    const { data: challenge, error: challengeError } = await ownerA
      .from('challenges')
      .select('challenge_status, activated_at, timezone, activation_snapshot')
      .eq('id', challengeId)
      .single();
    assert.equal(challengeError, null, `challenge lookup failed: ${challengeError?.message}`);
    assert.equal(challenge!.challenge_status, 'active');
    assert.ok(challenge!.activated_at, 'expected activated_at to be set');
    assert.equal(challenge!.timezone, 'Europe/Stockholm');
    assert.equal(challenge!.activation_snapshot?.goal, 'Feel stronger');

    const { data: periods, error: periodsError } = await ownerA
      .from('challenge_periods')
      .select('id, period_number, ends_at, reporting_closes_at')
      .eq('challenge_id', challengeId)
      .order('period_number', { ascending: true });
    assert.equal(periodsError, null, `periods lookup failed: ${periodsError?.message}`);
    assert.equal(periods?.length, 14, 'expected 14 daily periods for a 2-week daily Build challenge');
    const first = periods![0];
    const gapMs = new Date(first.reporting_closes_at).getTime() - new Date(first.ends_at).getTime();
    assert.equal(gapMs, 24 * 60 * 60 * 1000, 'expected exactly a 24-hour reporting window');
  });

  await t.test('repeated activation is idempotent', async () => {
    const { data, error } = await ownerA.rpc('activate_challenge_draft', {
      challenge_id: challengeId,
      activation_timezone: 'Europe/Stockholm',
    });
    assert.equal(error, null, `repeated activate_challenge_draft failed: ${error?.message}`);
    assert.equal(data.status, 'active');

    const { data: periods } = await ownerA.from('challenge_periods').select('id').eq('challenge_id', challengeId);
    assert.equal(periods?.length, 14, 'repeated activation must not create duplicate periods');
  });

  let firstPeriodId = '';
  await t.test('(test setup) read the first period id', async () => {
    const { data, error } = await ownerA
      .from('challenge_periods')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('period_number', 1)
      .single();
    assert.equal(error, null, `first period lookup failed: ${error?.message}`);
    firstPeriodId = data!.id;
  });

  const operationId = `e2e-checkin-${randomUUID()}`;
  await t.test('a real check-in is recorded through the real domain engine, over real HTTP', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: false,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(error, null, `append-check-in-event failed: ${error?.message}`);
    assert.equal(data.status, 'inserted');
    assert.ok(data.eventId, 'expected an eventId in the response');

    const { data: eventRow, error: eventError } = await ownerA
      .from('check_in_events')
      .select('event_type, event_payload, period_id')
      .eq('id', data.eventId)
      .single();
    assert.equal(eventError, null, `check-in event lookup failed: ${eventError?.message}`);
    assert.equal(eventRow!.event_type, 'build_completion');
    assert.deepEqual(eventRow!.event_payload, { kind: 'build_completion', completions: 1 });
    assert.equal(eventRow!.period_id, firstPeriodId);
  });

  await t.test('resubmitting the same operation id replays idempotently, without a second row', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: false,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(error, null, `idempotent replay call failed: ${error?.message}`);
    assert.equal(data.status, 'idempotent_replay');

    const { data: rows, error: countError } = await ownerA
      .from('check_in_events')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('period_id', firstPeriodId);
    assert.equal(countError, null, `check-in event count lookup failed: ${countError?.message}`);
    assert.equal(rows?.length, 1, 'a resubmitted operation id must not create a second row');
  });

  await t.test('an unflagged second, non-correction check-in for an already-decided period is rejected', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: `e2e-checkin-${randomUUID()}`,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: false,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(data, null);
    const status = (error as { context?: { status?: number } })?.context?.status;
    assert.equal(status, 409, `expected 409 (rejected) for an unflagged redeclaration, got: ${status}`);
  });

  const ownerB = freshClient();
  await t.test('another user cannot check in against User A\'s challenge', async () => {
    await signUpAndSignIn(ownerB, testEmail('activation-owner-b'));
    const { data, error } = await ownerB.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: `e2e-checkin-${randomUUID()}`,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: false,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(data, null);
    assert.ok(error, 'expected User B\'s attempt to be rejected');
  });

  let firstEventId = '';
  await t.test('(test setup) read the original check-in event id', async () => {
    const { data, error } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId).eq('event_type', 'build_completion').single();
    assert.equal(error, null, `original event lookup failed: ${error?.message}`);
    firstEventId = data!.id;
  });

  const correctionOperationId = `e2e-correction-${randomUUID()}`;
  let correctionEventId = '';
  await t.test('a correction changes the effective answer without touching the original event', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: correctionOperationId,
        fact: { kind: 'build_completion', completions: 0 },
        isCorrection: true,
        correctionOfEventId: firstEventId,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(error, null, `correction submission failed: ${error?.message}`);
    assert.equal(data.status, 'inserted');
    assert.ok(data.eventId, 'expected an eventId in the correction response');
    correctionEventId = data.eventId;

    const { data: correctionRow, error: correctionError } = await ownerA
      .from('check_in_events')
      .select('event_type, event_payload, correction_of_event_id')
      .eq('id', correctionEventId)
      .single();
    assert.equal(correctionError, null, `correction row lookup failed: ${correctionError?.message}`);
    assert.equal(correctionRow!.event_type, 'correction');
    assert.deepEqual(correctionRow!.event_payload, { kind: 'build_completion', completions: 0 });
    assert.equal(correctionRow!.correction_of_event_id, firstEventId);

    const { data: originalRow, error: originalError } = await ownerA
      .from('check_in_events')
      .select('event_type, event_payload')
      .eq('id', firstEventId)
      .single();
    assert.equal(originalError, null, `original event lookup failed: ${originalError?.message}`);
    assert.equal(originalRow!.event_type, 'build_completion', 'the original event must remain untouched — append-only');
    assert.deepEqual(originalRow!.event_payload, { kind: 'build_completion', completions: 1 }, 'the original event\'s recorded fact must never change');

    const { data: allRows } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId);
    assert.equal(allRows?.length, 2, 'expected exactly the original event plus the new correction — never an update in place');
  });

  await t.test('resubmitting the same correction operation id replays idempotently, without a second row', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: correctionOperationId,
        fact: { kind: 'build_completion', completions: 0 },
        isCorrection: true,
        correctionOfEventId: firstEventId,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(error, null, `idempotent correction replay failed: ${error?.message}`);
    assert.equal(data.status, 'idempotent_replay');
    assert.equal(data.eventId, correctionEventId);

    const { data: allRows } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId);
    assert.equal(allRows?.length, 2, 'a resubmitted correction operation id must not create a third row');
  });

  await t.test('a correction targeting an event that is no longer the currently-effective one is rejected', async () => {
    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: `e2e-correction-${randomUUID()}`,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: true,
        correctionOfEventId: firstEventId, // stale — the correction above is now effective, not this
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(data, null);
    const status = (error as { context?: { status?: number } })?.context?.status;
    assert.equal(status, 409, `expected 409 (correction_target_mismatch) for a stale correction target, got: ${status}`);

    const { data: allRows } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId);
    assert.equal(allRows?.length, 2, 'a rejected correction attempt must not create a row');
  });

  await t.test('another user cannot correct User A\'s check-in', async () => {
    const { data, error } = await ownerB.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: `e2e-correction-${randomUUID()}`,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: true,
        correctionOfEventId: correctionEventId,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(data, null);
    assert.ok(error, 'expected User B\'s correction attempt against User A\'s challenge to be rejected');

    const { data: allRows } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId);
    assert.equal(allRows?.length, 2, 'a rejected cross-user correction attempt must not create a row');
  });

  await t.test('(test setup, last: leaves the challenge terminal) a correction against a no-longer-active challenge is rejected', async () => {
    const { error: finalizeError } = await service.from('challenges').update({ challenge_status: 'completed_success', completed_at: new Date().toISOString() }).eq('id', challengeId);
    assert.equal(finalizeError, null, `service-role finalize simulation failed: ${finalizeError?.message}`);

    const { data, error } = await ownerA.functions.invoke('append-check-in-event', {
      body: {
        challengeId,
        periodId: firstPeriodId,
        operationId: `e2e-correction-${randomUUID()}`,
        fact: { kind: 'build_completion', completions: 1 },
        isCorrection: true,
        correctionOfEventId: correctionEventId,
        source: 'ios',
        clientRecordedAt: new Date().toISOString(),
      },
    });
    assert.equal(data, null);
    const status = (error as { context?: { status?: number } })?.context?.status;
    assert.equal(status, 400, `expected 400 (invalid_state) once the challenge is no longer active, got: ${status}`);

    const { data: allRows } = await ownerA.from('check_in_events').select('id').eq('challenge_id', challengeId).eq('period_id', firstPeriodId);
    assert.equal(allRows?.length, 2, 'a correction rejected for an inactive challenge must not create a row');
  });
});
