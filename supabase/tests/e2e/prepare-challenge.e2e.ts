/**
 * Real GoTrue + PostgREST end-to-end coverage for the trusted
 * `prepare_challenge_from_draft` RPC boundary — the layer
 * supabase/tests/run.sh's 090_prepare_challenge_from_draft.sql (native
 * PostgreSQL, service_role/authenticated impersonated via SET ROLE) cannot
 * reach: real JWT issuance, PostgREST's own RPC/grant handling, and the
 * client repository code path in lib/supabase/challenge-repository.ts's
 * shape. Run only in CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 *
 * See supabase/migrations/20260805000000_prepare_challenge_from_draft.sql
 * for what the RPC itself guarantees.
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
    successThresholdOverride: null,
  };
}

/** Saves a genuinely complete, ready_for_activation draft through the same
 * client-side mapping/mutation-planning code the app uses, mirroring
 * auth-and-draft.e2e.ts's insert path rather than reimplementing it. */
async function saveReadyDraft(client: ReturnType<typeof freshClient>, ownerId: string): Promise<string> {
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
  const { error } = await client.from('challenge_drafts').insert(plan.row);
  assert.equal(error, null, `draft insert failed: ${error?.message}`);
  return draftId;
}

test('prepare_challenge_from_draft: trusted server boundary for pending commitments', async (t) => {
  const ownerA = freshClient();
  let userIdA = '';
  await t.test('User A signs up through GoTrue', async () => {
    userIdA = (await signUpAndSignIn(ownerA, testEmail('owner-a'))).userId;
  });

  let draftId = '';
  await t.test('a complete draft is saved as ready_for_activation', async () => {
    draftId = await saveReadyDraft(ownerA, userIdA);
  });

  let challengeId = '';
  await t.test('the RPC succeeds and returns a pending_activation challenge', async () => {
    const { data, error } = await ownerA.rpc('prepare_challenge_from_draft', { draft_id: draftId });
    assert.equal(error, null, `prepare_challenge_from_draft failed: ${error?.message}`);
    assert.equal(data.status, 'pending_activation');
    assert.ok(data.challengeId, 'expected a challengeId in the RPC response');
    challengeId = data.challengeId;
  });

  await t.test('the challenge, recipient, and consequence rows all exist as expected — and nothing activation-shaped', async () => {
    const { data: challenge, error: challengeError } = await ownerA
      .from('challenges')
      .select('challenge_status, source_draft_id, activated_at, starts_at, planned_ends_at, timezone, activation_snapshot')
      .eq('id', challengeId)
      .single();
    assert.equal(challengeError, null, `challenge lookup failed: ${challengeError?.message}`);
    assert.equal(challenge!.challenge_status, 'pending_activation');
    assert.equal(challenge!.source_draft_id, draftId);
    assert.equal(challenge!.activated_at, null);
    assert.equal(challenge!.starts_at, null);
    assert.equal(challenge!.planned_ends_at, null);
    assert.equal(challenge!.timezone, null);
    assert.equal(challenge!.activation_snapshot, null);

    const { data: recipients, error: recipientsError } = await ownerA
      .from('challenge_recipients')
      .select('display_name, sort_order, recipient_role')
      .eq('challenge_id', challengeId);
    assert.equal(recipientsError, null, `recipients lookup failed: ${recipientsError?.message}`);
    assert.equal(recipients?.length, 1, 'expected exactly one recipient row');
    assert.equal(recipients?.[0]?.display_name, 'Anna');
    assert.equal(recipients?.[0]?.recipient_role, 'recipient_organizer');

    const { data: consequence, error: consequenceError } = await ownerA
      .from('consequences')
      .select('status, stake_minor_units, currency, authorization_status')
      .eq('challenge_id', challengeId)
      .single();
    assert.equal(consequenceError, null, `consequence lookup failed: ${consequenceError?.message}`);
    assert.equal(consequence!.status, 'payment_method_required', 'consequence must be an honest pre-payment state, not fake authorization');
    assert.equal(consequence!.stake_minor_units, 7500);
    assert.equal(consequence!.currency, 'USD');
    assert.equal(consequence!.authorization_status, 'not_requested');
  });

  await t.test('the source draft was archived only after preparation succeeded', async () => {
    const { data, error } = await ownerA.from('challenge_drafts').select('draft_status').eq('id', draftId).single();
    assert.equal(error, null, `draft lookup failed: ${error?.message}`);
    assert.equal(data!.draft_status, 'archived');
  });

  // Regression test for the "archived challenge_drafts rows are immutable"
  // bug reported from the real app: after a successful prepare, the client
  // (app/create/review.tsx) held onto the now-archived draft's id in
  // OnboardingContext. Navigating backward into the creation flow and
  // forward again reached Review a second time and re-submitted the same
  // draft id through saveChallengeDraft's UPDATE path, which the DB
  // correctly rejects — but the client wasn't handling that rejection, so
  // the raw database message reached the user. This exercises the exact
  // client code path (planDraftMutation + the real update call
  // saveChallengeDraft issues) against the real archived row, confirming
  // both that the database keeps rejecting it and that the error carries
  // the "archived" wording review.tsx's saveDraft() now specifically
  // detects to redirect the user to their real pending commitment instead
  // of showing a raw database error.
  await t.test('re-saving the archived source draft through the client repository is rejected, not silently allowed', async () => {
    const localRecipientId = 'recipient-local-1';
    const recipientIds = resolveRecipientIds([{ id: localRecipientId, name: 'Anna' }], () => randomUUID());
    const mapped = mapOnboardingDraft(buildOnboardingData(localRecipientId), {
      draftId: draftId as ChallengeDraftId,
      ownerId: userIdA as UserId,
      recipientIds,
    });
    assert.equal(mapped.ok, true, 'fixture must still map to a valid draft');
    if (!mapped.ok) throw new Error('unreachable');

    const plan = planDraftMutation(draftId, draftId, userIdA, mapped.value);
    assert.equal(plan.kind, 'update');
    if (plan.kind !== 'update') throw new Error('unreachable');

    const { error } = await ownerA.from('challenge_drafts').update(plan.row).eq('id', plan.id);
    assert.ok(error, 'expected updating the archived draft to be rejected');
    assert.match(
      error!.message.toLowerCase(),
      /archived/,
      `expected the archived-immutability error; got: ${error?.message}`,
    );

    const { data: draft, error: readError } = await ownerA
      .from('challenge_drafts')
      .select('draft_status, draft_payload')
      .eq('id', draftId)
      .single();
    assert.equal(readError, null, `draft readback failed: ${readError?.message}`);
    assert.equal(draft!.draft_status, 'archived', 'the rejected update must not have changed draft_status');
    assert.equal(
      (draft!.draft_payload as { goal?: string }).goal,
      'Sleep better',
      'the rejected update must not have changed the archived draft_payload',
    );
  });

  await t.test('repeating the request returns the same challenge, never a duplicate', async () => {
    const { data, error } = await ownerA.rpc('prepare_challenge_from_draft', { draft_id: draftId });
    assert.equal(error, null, `repeat prepare_challenge_from_draft failed: ${error?.message}`);
    assert.equal(data.challengeId, challengeId, 'a repeat request must return the very same challenge id');
    assert.equal(data.status, 'pending_activation');

    const { data: challenges, error: listError } = await ownerA.from('challenges').select('id').eq('source_draft_id', draftId);
    assert.equal(listError, null, `challenge list failed: ${listError?.message}`);
    assert.equal(challenges?.length, 1, 'a repeated prepare request must not create a duplicate challenge');
  });

  const ownerB = freshClient();
  await t.test('another user cannot prepare User A\'s draft', async () => {
    await signUpAndSignIn(ownerB, testEmail('owner-b'));
    const { data, error } = await ownerB.rpc('prepare_challenge_from_draft', { draft_id: draftId });
    assert.ok(error, 'expected an error preparing another user\'s draft');
    assert.equal(data, null);

    // User A's already-prepared challenge must be completely unaffected.
    const { data: challenges } = await ownerA.from('challenges').select('id').eq('source_draft_id', draftId);
    assert.equal(challenges?.length, 1, 'User B\'s rejected attempt must not touch User A\'s challenge');
  });

  let incompleteDraftId = '';
  await t.test('an incomplete/tampered draft is rejected even though it satisfies the looser table constraints', async () => {
    incompleteDraftId = randomUUID();
    const { error: insertError } = await ownerA.from('challenge_drafts').insert({
      id: incompleteDraftId,
      owner_id: userIdA,
      schema_version: 1,
      draft_status: 'ready_for_activation',
      draft_payload: {
        schemaVersion: 1,
        id: incompleteDraftId,
        ownerId: userIdA,
        goal: 'Sleep better',
        behavior: { description: 'Strength train', completionDefinition: 'Complete the planned session', rule: { direction: 'build' } },
        duration: { unit: 'week', value: 4 },
        successRule: { direction: 'build', ruleVersion: 1 },
        // Empty recipients, no organizer, no experience category, the
        // sit-out promise not acknowledged: all pass challenge_drafts' own
        // coarse CHECK constraints but must fail the RPC's revalidation.
        recipients: [],
        rewardOrganizer: null,
        experienceCategory: null,
        stake: { minorUnits: 7500, currency: 'USD' },
        sitOutAcknowledged: false,
        invitationMessage: '',
        membershipSelection: null,
      },
    });
    assert.equal(insertError, null, `incomplete draft insert failed: ${insertError?.message}`);

    const { data, error } = await ownerA.rpc('prepare_challenge_from_draft', { draft_id: incompleteDraftId });
    assert.ok(error, 'expected the incomplete draft to be rejected');
    assert.equal(data, null);

    const { data: draft, error: readError } = await ownerA
      .from('challenge_drafts')
      .select('draft_status')
      .eq('id', incompleteDraftId)
      .single();
    assert.equal(readError, null, `incomplete draft readback failed: ${readError?.message}`);
    assert.equal(draft!.draft_status, 'ready_for_activation', 'a rejected draft must not be archived');

    const { data: challenges } = await ownerA.from('challenges').select('id').eq('source_draft_id', incompleteDraftId);
    assert.equal(challenges?.length, 0, 'a rejected draft must not produce a challenge');
  });

  await t.test('direct client writes to challenges/challenge_recipients/consequences remain impossible', async () => {
    const { error: challengeError } = await ownerA.from('challenges').update({ challenge_status: 'active' }).eq('id', challengeId);
    assert.equal(challengeError?.code, '42501', `expected permission-denied updating challenges, got: ${JSON.stringify(challengeError)}`);

    const { error: consequenceError } = await ownerA.from('consequences').update({ status: 'authorized' }).eq('challenge_id', challengeId);
    assert.equal(consequenceError?.code, '42501', `expected permission-denied updating consequences, got: ${JSON.stringify(consequenceError)}`);

    const { error: recipientError } = await ownerA
      .from('challenge_recipients')
      .insert({ challenge_id: challengeId, display_name: 'Injected', sort_order: 3 });
    assert.equal(recipientError?.code, '42501', `expected permission-denied inserting challenge_recipients, got: ${JSON.stringify(recipientError)}`);
  });

  // Success Means (successRule ruleVersion 2) — see
  // supabase/migrations/20260906000000_success_means_v2.sql. Owner C is
  // fresh (never used above) so these do not collide with Owner A's live
  // pending commitment.
  const ownerC = freshClient();
  let userIdC = '';
  let v2DraftId = '';
  let v2ChallengeId = '';
  await t.test('User C signs up through GoTrue', async () => {
    userIdC = (await signUpAndSignIn(ownerC, testEmail('owner-c'))).userId;
  });

  await t.test('a genuinely valid, stricter-than-baseline V2 Success Means draft is accepted through the real client mapping', async () => {
    const localRecipientId = 'recipient-local-1';
    v2DraftId = randomUUID();
    const recipientIds = resolveRecipientIds([{ id: localRecipientId, name: 'Anna' }], () => randomUUID());
    const data = { ...buildOnboardingData(localRecipientId), successThresholdOverride: 27 };
    const mapped = mapOnboardingDraft(data, { draftId: v2DraftId as ChallengeDraftId, ownerId: userIdC as UserId, recipientIds });
    assert.equal(mapped.ok, true, 'fixture must map to a valid draft');
    if (!mapped.ok) throw new Error('unreachable');
    assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.ruleVersion, 2);
    assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.minimumRequiredCompletions, 27);

    const plan = planDraftMutation(null, v2DraftId, userIdC, mapped.value);
    assert.equal(plan.kind, 'insert');
    if (plan.kind !== 'insert') throw new Error('unreachable');
    const { error: insertError } = await ownerC.from('challenge_drafts').insert(plan.row);
    assert.equal(insertError, null, `V2 draft insert failed: ${insertError?.message}`);

    const { data: prepared, error } = await ownerC.rpc('prepare_challenge_from_draft', { draft_id: v2DraftId });
    assert.equal(error, null, `prepare_challenge_from_draft failed for a valid V2 draft: ${error?.message}`);
    assert.equal(prepared.status, 'pending_activation');
    v2ChallengeId = prepared.challengeId;
  });

  await t.test('a malicious V2 draft crafted directly against challenge_drafts (bypassing the client mapping entirely) is rejected by the independent server re-derivation', async () => {
    const maliciousDraftId = randomUUID();
    const { error: insertError } = await ownerC.from('challenge_drafts').insert({
      id: maliciousDraftId,
      owner_id: userIdC,
      schema_version: 1,
      draft_status: 'ready_for_activation',
      draft_payload: {
        schemaVersion: 1,
        id: maliciousDraftId,
        ownerId: userIdC,
        goal: 'Sleep better',
        behavior: { description: 'Strength train', completionDefinition: 'Complete the planned session', rule: { direction: 'build', measurement: { type: 'completion', unit: 'completion' }, rhythm: { type: 'daily', periodUnit: 'day', target: 1 } } },
        duration: { unit: 'week', value: 4 },
        // Kinwin's true baseline for 4 weeks daily is 25 of 28 (see
        // domain/challenge/success-rule.test.ts) — this claims a selected
        // minimum of 10, far below it, while still declaring ruleVersion 2
        // and a plausible-looking totalPlannedCompletions.
        successRule: { direction: 'build', ruleVersion: 2, totalPlannedCompletions: 28, minimumRequiredCompletions: 10, continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day' },
        recipients: [{ id: randomUUID(), name: 'Anna' }],
        rewardOrganizer: { type: 'other', name: 'Anna' },
        experienceCategory: 'dinner',
        stake: { minorUnits: 7500, currency: 'USD' },
        sitOutAcknowledged: true,
        invitationMessage: 'Join me in this promise.',
        membershipSelection: 'monthly_trial',
      },
    });
    assert.equal(insertError, null, `malicious draft insert failed: ${insertError?.message}`);

    const { data, error } = await ownerC.rpc('prepare_challenge_from_draft', { draft_id: maliciousDraftId });
    assert.ok(error, 'expected the below-baseline V2 draft to be rejected');
    assert.equal(data, null);

    const { data: draft, error: readError } = await ownerC.from('challenge_drafts').select('draft_status').eq('id', maliciousDraftId).single();
    assert.equal(readError, null, `malicious draft readback failed: ${readError?.message}`);
    assert.equal(draft!.draft_status, 'ready_for_activation', 'a rejected malicious V2 draft must not be archived');

    const { data: challenges } = await ownerC.from('challenges').select('id').eq('source_draft_id', maliciousDraftId);
    assert.equal(challenges?.length, 0, 'a rejected malicious V2 draft must not produce a challenge');

    // Owner C's real, valid V2 commitment from the previous test must be
    // completely unaffected by the rejected attempt.
    const { data: stillThere } = await ownerC.from('challenges').select('id').eq('id', v2ChallengeId);
    assert.equal(stillThere?.length, 1);
  });
});
