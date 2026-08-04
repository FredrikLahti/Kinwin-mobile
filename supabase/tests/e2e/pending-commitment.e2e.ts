/**
 * Real GoTrue + PostgREST end-to-end coverage for reading a pending
 * commitment and the trusted `cancel_pending_challenge` RPC boundary (see
 * supabase/migrations/20260806000000_cancel_pending_challenge.sql). Run
 * only in CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 *
 * Does not exercise "cancellation of an active/completed challenge is
 * rejected" — there is no client-reachable way to produce a real *active*
 * challenge yet (full activation is still future work, tracked as phase 3b
 * in docs/BACKEND_IMPLEMENTATION_PLAN.md); that case is already proven at
 * the Postgres level in supabase/tests/100_cancel_pending_challenge.sql
 * against a directly-inserted fixture.
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

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_ANON_KEY must be set (from `supabase status -o env` against a running `supabase start`). ' +
      'This suite talks to a real local GoTrue/PostgREST stack and refuses to run without it — no mocked backend.',
  );
}

function freshClient() {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
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
  };
}

/** Saves a complete draft and prepares it into a pending commitment, mirroring the app's real save -> prepare sequence. */
async function createPendingCommitment(client: ReturnType<typeof freshClient>, ownerId: string): Promise<string> {
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
  assert.equal(data.status, 'pending_activation');
  return data.challengeId as string;
}

test('reading and canceling a pending commitment', async (t) => {
  const ownerA = freshClient();
  let userIdA = '';
  await t.test('User A signs up through GoTrue', async () => {
    userIdA = (await signUpAndSignIn(ownerA, testEmail('owner-a'))).userId;
  });

  let challengeId = '';
  await t.test('a pending commitment exists to read', async () => {
    challengeId = await createPendingCommitment(ownerA, userIdA);
  });

  await t.test('the owner can read their pending commitment (challenge, recipients, consequence)', async () => {
    const { data: challenge, error: challengeError } = await ownerA
      .from('challenges')
      .select('challenge_status, source_draft_id')
      .eq('owner_id', userIdA)
      .eq('challenge_status', 'pending_activation')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    assert.equal(challengeError, null, `challenge read failed: ${challengeError?.message}`);
    assert.equal(challenge?.challenge_status, 'pending_activation');
    assert.ok(challenge?.source_draft_id, 'expected a source_draft_id to read the locked-in summary from');

    const { data: recipients, error: recipientsError } = await ownerA
      .from('challenge_recipients')
      .select('display_name, recipient_role')
      .eq('challenge_id', challengeId);
    assert.equal(recipientsError, null, `recipients read failed: ${recipientsError?.message}`);
    assert.equal(recipients?.length, 1);
    assert.equal(recipients?.[0]?.display_name, 'Anna');

    const { data: consequence, error: consequenceError } = await ownerA
      .from('consequences')
      .select('status, stake_minor_units, currency')
      .eq('challenge_id', challengeId)
      .single();
    assert.equal(consequenceError, null, `consequence read failed: ${consequenceError?.message}`);
    assert.equal(consequence!.status, 'payment_method_required');
    assert.equal(consequence!.stake_minor_units, 7500);
  });

  const ownerB = freshClient();
  await t.test('another user cannot read User A\'s pending commitment', async () => {
    await signUpAndSignIn(ownerB, testEmail('owner-b'));
    const { data, error } = await ownerB.from('challenges').select('id').eq('id', challengeId);
    assert.equal(error, null, `unexpected error (should be an empty, RLS-filtered result, not an error): ${error?.message}`);
    assert.equal(data?.length, 0, 'User B must not be able to read User A\'s pending commitment');
  });

  await t.test('signed-out access to the pending commitment is denied', async () => {
    const anon = freshClient();
    const { error } = await anon.from('challenges').select('id').eq('id', challengeId);
    assert.equal(error?.code, '42501', `expected a permission-denied error for anon (no GRANT on this table), got: ${JSON.stringify(error)}`);
  });

  await t.test('another user cannot cancel User A\'s pending commitment', async () => {
    const { data, error } = await ownerB.rpc('cancel_pending_challenge', { challenge_id: challengeId });
    assert.ok(error, 'expected an error canceling another user\'s pending commitment');
    assert.equal(data, null);

    const { data: stillPending } = await ownerA.from('challenges').select('challenge_status').eq('id', challengeId).single();
    assert.equal(stillPending?.challenge_status, 'pending_activation', 'User B\'s rejected attempt must not touch User A\'s challenge');
  });

  await t.test('the owner cancels the pending commitment', async () => {
    const { data, error } = await ownerA.rpc('cancel_pending_challenge', { challenge_id: challengeId });
    assert.equal(error, null, `cancel_pending_challenge failed: ${error?.message}`);
    assert.equal(data.status, 'canceled_before_activation');
    assert.equal(data.challengeId, challengeId);
  });

  await t.test('the challenge and its consequence were both canceled atomically; nothing was deleted', async () => {
    const { data: challenge, error: challengeError } = await ownerA
      .from('challenges').select('challenge_status').eq('id', challengeId).single();
    assert.equal(challengeError, null, `challenge re-read failed: ${challengeError?.message}`);
    assert.equal(challenge!.challenge_status, 'canceled_before_activation');

    const { data: consequence, error: consequenceError } = await ownerA
      .from('consequences').select('status').eq('challenge_id', challengeId).single();
    assert.equal(consequenceError, null, `consequence re-read failed: ${consequenceError?.message}`);
    assert.equal(consequence!.status, 'canceled_before_activation');

    const { data: recipients } = await ownerA.from('challenge_recipients').select('id').eq('challenge_id', challengeId);
    assert.equal(recipients?.length, 1, 'the recipient row must still exist, not be deleted');
  });

  await t.test('repeated cancellation is idempotent', async () => {
    const { data, error } = await ownerA.rpc('cancel_pending_challenge', { challenge_id: challengeId });
    assert.equal(error, null, `repeat cancel_pending_challenge failed: ${error?.message}`);
    assert.equal(data.status, 'canceled_before_activation');
    assert.equal(data.challengeId, challengeId);

    const { data: challenges } = await ownerA.from('challenges').select('id').eq('id', challengeId);
    assert.equal(challenges?.length, 1, 'a repeated cancel request must not create or duplicate anything');
  });

  await t.test('the user can create a new draft after cancellation', async () => {
    const newDraftId = randomUUID();
    const recipientIds = resolveRecipientIds([{ id: 'recipient-local-2', name: 'Björn' }], () => randomUUID());
    const mapped = mapOnboardingDraft(buildOnboardingData('recipient-local-2'), {
      draftId: newDraftId as ChallengeDraftId,
      ownerId: userIdA as UserId,
      recipientIds,
    });
    assert.equal(mapped.ok, true, 'fixture must map to a valid draft');
    if (!mapped.ok) throw new Error('unreachable');
    const plan = planDraftMutation(null, newDraftId, userIdA, mapped.value);
    assert.equal(plan.kind, 'insert');
    if (plan.kind !== 'insert') throw new Error('unreachable');
    const { error } = await ownerA.from('challenge_drafts').insert(plan.row);
    assert.equal(error, null, `starting a new draft after cancellation failed: ${error?.message}`);
  });
});
