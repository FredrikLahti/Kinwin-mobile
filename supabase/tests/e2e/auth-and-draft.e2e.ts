/**
 * Real GoTrue + PostgREST end-to-end coverage — the layer
 * supabase/tests/run.sh (native PostgreSQL only) cannot reach. Run only in
 * CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 *
 * Exercises the same client-side decision logic the app uses
 * (mapOnboardingDraft, planDraftMutation, resolveRecipientIds,
 * applyResolvedRecipientIds, restoreOnboardingDraftData) against a real
 * HTTP client, rather than re-implementing save/load logic separately —
 * so this proves the app's actual save/load code path works against real
 * GoTrue-issued JWTs and real PostgREST requests, not just against SQL run
 * directly as a superuser.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { mapOnboardingDraft, OnboardingDraftData } from '../../../domain/challenge/from-onboarding-draft';
import { applyResolvedRecipientIds, resolveRecipientIds } from '../../../domain/challenge/recipient-ids';
import { restoreOnboardingDraftData } from '../../../domain/challenge/to-onboarding-draft';
import type { ChallengeDraft, ChallengeDraftId, RecipientId, UserId } from '../../../domain/challenge/types';
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
  // No AsyncStorage/persistSession here: this is a one-shot Node process,
  // not the RN app, and each test wants an isolated, explicit session.
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
  assert.ok(signUp.data.user, 'signUp did not return a user');

  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.equal(signIn.error, null, `signInWithPassword failed: ${signIn.error?.message}`);
  assert.ok(signIn.data.session, 'signInWithPassword did not return a session');
  const jwtSegments = signIn.data.session!.access_token.split('.');
  assert.equal(jwtSegments.length, 3, 'access_token does not look like a real JWT issued by GoTrue');

  return { userId: signIn.data.session!.user.id, session: signIn.data.session! };
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

function mapDraft(data: OnboardingDraftData, draftId: string, ownerId: string, recipientIds: Record<string, RecipientId>): ChallengeDraft {
  const mapped = mapOnboardingDraft(data, {
    draftId: draftId as ChallengeDraftId,
    ownerId: ownerId as UserId,
    recipientIds,
  });
  assert.equal(mapped.ok, true, 'fixture must map to a valid draft');
  if (!mapped.ok) throw new Error('unreachable');
  return mapped.value;
}

test('signup, profile creation, login, draft save/update/reload, and cross-user isolation', async (t) => {
  const ownerA = freshClient();
  const emailA = testEmail('owner-a');
  let userIdA = '';
  await t.test('User A signs up through GoTrue', async () => {
    userIdA = (await signUpAndSignIn(ownerA, emailA)).userId;
  });

  await t.test('a matching profile row was created automatically', async () => {
    const { data, error } = await ownerA.from('profiles').select('id').eq('id', userIdA).maybeSingle();
    assert.equal(error, null, `profile lookup failed: ${error?.message}`);
    assert.ok(data, 'no profile row was auto-created for the new auth.users row');
    assert.equal(data!.id, userIdA, 'profile id does not match the signed-up user id — client must never choose it');
  });

  const localRecipientId = 'recipient-local-1';
  const draftId = randomUUID();
  const recipientIds = resolveRecipientIds([{ id: localRecipientId, name: 'Anna' }], () => randomUUID());
  const draftV1 = mapDraft(buildOnboardingData(localRecipientId), draftId, userIdA, recipientIds);

  await t.test('draft insert through PostgREST (new draft => insert, not upsert)', async () => {
    const plan = planDraftMutation(null, draftId, userIdA, draftV1);
    assert.equal(plan.kind, 'insert');
    if (plan.kind !== 'insert') throw new Error('unreachable');
    const { error } = await ownerA.from('challenge_drafts').insert(plan.row);
    assert.equal(error, null, `draft insert failed: ${error?.message}`);
  });

  const stableRecipients = applyResolvedRecipientIds([{ id: localRecipientId, name: 'Anna' }], { type: 'recipient', recipientId: localRecipientId }, recipientIds);
  const dataV2: OnboardingDraftData = {
    ...buildOnboardingData(localRecipientId),
    goal: 'Sleep better, consistently',
    recipients: stableRecipients.recipients,
    rewardOrganizer: stableRecipients.rewardOrganizer,
  };
  const secondSaveRecipientIds = resolveRecipientIds(stableRecipients.recipients, () => {
    throw new Error('a second save of an already-stable recipient must not mint a new id');
  });
  const draftV2 = mapDraft(dataV2, draftId, userIdA, secondSaveRecipientIds);

  await t.test('draft update through PostgREST does not duplicate the row', async () => {
    const plan = planDraftMutation(draftId, draftId, userIdA, draftV2);
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') throw new Error('unreachable');
    assert.ok(!('id' in plan.row) && !('owner_id' in plan.row), 'update payload must never include id/owner_id');
    const { error } = await ownerA.from('challenge_drafts').update(plan.row).eq('id', plan.id);
    assert.equal(error, null, `draft update failed: ${error?.message}`);

    const { data, error: selectError } = await ownerA.from('challenge_drafts').select('id').eq('owner_id', userIdA);
    assert.equal(selectError, null, `post-update row-count check failed: ${selectError?.message}`);
    assert.equal(data?.length, 1, 'expected exactly one draft row for this owner after an update — insert must not have run twice');
  });

  await t.test('reload/readback restores the updated draft correctly', async () => {
    const { data, error } = await ownerA.from('challenge_drafts').select('id, draft_payload').eq('id', draftId).single();
    assert.equal(error, null, `reload failed: ${error?.message}`);
    const restored = restoreOnboardingDraftData(data!.draft_payload as ChallengeDraft);
    assert.equal(restored.goal, 'Sleep better, consistently');
    assert.equal(restored.recipients[0]?.name, 'Anna');
  });

  const ownerB = freshClient();
  const emailB = testEmail('owner-b');
  await t.test('User B signs up and cannot read User A\'s draft', async () => {
    await signUpAndSignIn(ownerB, emailB);
    const { data, error } = await ownerB.from('challenge_drafts').select('id').eq('id', draftId);
    assert.equal(error, null, `unexpected error (should be an empty, RLS-filtered result, not an error): ${error?.message}`);
    assert.equal(data?.length, 0, 'User B must not be able to read User A\'s draft');
  });

  await t.test('User B cannot change User A\'s draft', async () => {
    const { data, error } = await ownerB
      .from('challenge_drafts')
      .update({ draft_status: 'archived' })
      .eq('id', draftId)
      .select('id');
    assert.equal(error, null, `unexpected error (should be zero rows affected, not an error): ${error?.message}`);
    assert.equal(data?.length, 0, 'User B\'s update must affect zero rows on User A\'s draft');

    const { data: stillReady } = await ownerA.from('challenge_drafts').select('draft_status').eq('id', draftId).single();
    assert.equal(stillReady?.draft_status, 'ready_for_activation', 'User A\'s draft must be unchanged by User B\'s attempted update');
  });

  // Unlike User B (authenticated, RLS silently filters to an empty result),
  // `anon` has no GRANT at all on challenge_drafts — only `authenticated`
  // does (see the initial migration and supabase/tests/020_rls_anon.sql's
  // anon_select_challenge_drafts_denied) — so an anon/signed-out request is
  // rejected outright with 42501 before RLS is even evaluated, not
  // filtered down to zero rows.
  await t.test('signed-out access cannot read the draft', async () => {
    const anon = freshClient();
    const { error } = await anon.from('challenge_drafts').select('id').eq('id', draftId);
    assert.equal(error?.code, '42501', `expected a permission-denied error for anon (no GRANT on this table), got: ${JSON.stringify(error)}`);
  });

  await t.test('sign-out actually invalidates the session (the auth-layer half of clearing protected state)', async () => {
    // The client-side reset of onboarding UI state on sign-out
    // (contexts/onboarding-context.tsx's resetDraft, wired in
    // app/_layout.tsx's AuthGate) is React-only and covered by
    // contexts/onboarding-context.test.ts in the regular unit-test suite —
    // there is no React tree here to exercise it against. What a headless
    // HTTP client against real GoTrue *can* prove is the auth-layer half:
    // signOut() must actually invalidate the session, so a client that
    // held it can no longer read what it could read a moment ago.
    const { error: signOutError } = await ownerA.auth.signOut();
    assert.equal(signOutError, null, `signOut failed: ${signOutError?.message}`);
    const { data: sessionAfter } = await ownerA.auth.getSession();
    assert.equal(sessionAfter.session, null, 'session must be cleared after signOut');
    const { error } = await ownerA.from('challenge_drafts').select('id').eq('id', draftId);
    assert.equal(error?.code, '42501', `expected the now-anon client to be permission-denied (no GRANT on this table), got: ${JSON.stringify(error)}`);
  });
});
