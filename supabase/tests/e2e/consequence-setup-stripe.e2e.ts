/**
 * Real GoTrue + PostgREST + Edge Runtime end-to-end coverage for the two
 * Stripe consequence-setup Edge Functions
 * (supabase/functions/create-consequence-setup-intent,
 * supabase/functions/stripe-consequence-webhook) — the layer
 * supabase/tests/140_consequence_setup_stripe.sql (native PostgreSQL,
 * service_role impersonated via SET ROLE) cannot reach: real JWT
 * verification at the Edge Runtime gateway, `@supabase/server`'s own
 * `withSupabase` auth handling, and real HTTP request/response wiring. Run
 * only in CI against a `supabase start` local stack (see
 * .github/workflows/supabase-e2e.yml); never against a hosted project.
 *
 * Deterministic by design: `supabase/functions/.env` in CI carries
 * placeholder, non-functional Stripe keys (see that workflow), so every
 * assertion below is reachable without a real Stripe account. Requests that
 * would need a genuine Stripe API call to fully succeed are asserted to
 * fail in the one specific way that proves the auth/ownership/RPC layer
 * already did its job correctly (502 `payment_provider_error` — reached
 * only after passing authentication, ownership, and pending-state checks)
 * rather than in any way that would indicate a bug in this system's own
 * logic. If STRIPE_LIVE_TEST_SECRET_KEY and
 * STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET are set to real Stripe *test
 * mode* secrets (never invented or requested by this suite — see
 * docs/PAYMENT_SETUP.md), an additional real round trip runs and is
 * clearly labeled; otherwise that section is skipped, not faked.
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

import { mapOnboardingDraft, OnboardingDraftData } from '../../../domain/challenge/from-onboarding-draft';
import { resolveRecipientIds } from '../../../domain/challenge/recipient-ids';
import type { ChallengeDraftId, UserId } from '../../../domain/challenge/types';
import { planDraftMutation } from '../../../lib/supabase/draft-mutation';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const STRIPE_WEBHOOK_SIGNING_SECRET = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_WEBHOOK_SIGNING_SECRET) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_ANON_KEY (from `supabase status -o env`), and STRIPE_WEBHOOK_SIGNING_SECRET ' +
      '(the same placeholder value written to supabase/functions/.env for this local stack) must all be set. ' +
      'This suite talks to a real local GoTrue/PostgREST/Edge-Runtime stack and refuses to run without it.',
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
  return { userId: signIn.data.session!.user.id, accessToken: signIn.data.session!.access_token };
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

/** Creates a real pending commitment (challenge + consequence) via the existing trusted RPC, mirroring prepare-challenge.e2e.ts. */
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

/** Stripe's own local (no-API-call) v1 webhook signature scheme, reproduced with Node's built-in crypto — the same scheme `stripe.webhooks.generateTestHeaderString` implements. */
function signStripeWebhookPayload(payload: string, secret: string, timestamp: number = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function postWebhook(body: unknown, signatureHeader: string | null): Promise<Response> {
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signatureHeader !== null) headers['Stripe-Signature'] = signatureHeader;
  return fetch(`${SUPABASE_URL}/functions/v1/stripe-consequence-webhook`, { method: 'POST', headers, body: payload });
}

function fakeSetupIntentEvent(setupIntentId: string, type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${randomUUID()}`,
    type,
    data: {
      object: {
        id: setupIntentId,
        object: 'setup_intent',
        customer: 'cus_fake',
        payment_method: 'pm_fake',
        status: 'succeeded',
        ...overrides,
      },
    },
  };
}

test('create-consequence-setup-intent: auth, ownership, and request validation over real HTTP', async (t) => {
  await t.test('a signed-out caller is rejected', async () => {
    const anon = freshClient();
    const { data, error } = await anon.functions.invoke('create-consequence-setup-intent', { body: { challengeId: randomUUID() } });
    assert.equal(data, null);
    assert.ok(error, 'expected an error for a signed-out caller');
  });

  const ownerA = freshClient();
  let userIdA = '';
  await t.test('User A signs up through GoTrue', async () => {
    userIdA = (await signUpAndSignIn(ownerA, testEmail('stripe-owner-a'))).userId;
  });

  await t.test('a request with neither challengeId nor consequenceId is rejected as invalid', async () => {
    const { data, error } = await ownerA.functions.invoke('create-consequence-setup-intent', { body: {} });
    assert.equal(data, null);
    assert.ok(error, 'expected a validation error');
  });

  await t.test('an unknown challenge id is rejected as not found, without ever reaching Stripe', async () => {
    const { data, error } = await ownerA.functions.invoke('create-consequence-setup-intent', { body: { challengeId: randomUUID() } });
    assert.equal(data, null);
    assert.ok(error, 'expected a not-found error');
  });

  let challengeIdA = '';
  await t.test('User A prepares a real pending commitment', async () => {
    challengeIdA = (await createPendingCommitment(ownerA, userIdA)).challengeId;
  });

  const ownerB = freshClient();
  await t.test('another user cannot create a setup attempt for User A\'s challenge', async () => {
    await signUpAndSignIn(ownerB, testEmail('stripe-owner-b'));
    const { data, error } = await ownerB.functions.invoke('create-consequence-setup-intent', { body: { challengeId: challengeIdA } });
    assert.equal(data, null);
    assert.ok(error, 'expected User B\'s attempt to be rejected');
  });

  await t.test(
    'User A\'s own request reaches the trusted RPC layer successfully — either a real SetupIntent (if real Stripe test secrets are configured) or a 502 payment_provider_error (proving auth/ownership/RPC passed and only the placeholder Stripe key failed), never an auth/ownership/validation error',
    async () => {
      const { data, error } = await ownerA.functions.invoke('create-consequence-setup-intent', { body: { challengeId: challengeIdA } });
      if (error) {
        // FunctionsHttpError exposes the response on `context`.
        const status = (error as { context?: { status?: number } }).context?.status;
        assert.equal(status, 502, `expected 502 (payment_provider_error) with placeholder Stripe secrets, got ${status}: ${error.message}`);
      } else {
        assert.ok(typeof data.clientSecret === 'string' && data.clientSecret.length > 0, 'expected a client secret from a real Stripe test-mode call');
        assert.equal(typeof data.consequenceId, 'string');
      }
    },
  );
});

test('stripe-consequence-webhook: signature verification over real HTTP', async (t) => {
  const fakeSetupIntentId = `seti_e2e_${randomUUID()}`;

  await t.test('a request with no Stripe-Signature header is rejected', async () => {
    const response = await postWebhook(fakeSetupIntentEvent(fakeSetupIntentId, 'setup_intent.succeeded'), null);
    assert.equal(response.status, 400);
  });

  await t.test('a request signed with the wrong secret is rejected', async () => {
    const payload = fakeSetupIntentEvent(fakeSetupIntentId, 'setup_intent.succeeded');
    const badSignature = signStripeWebhookPayload(JSON.stringify(payload), 'whsec_definitely_the_wrong_secret');
    const response = await postWebhook(payload, badSignature);
    assert.equal(response.status, 400);
  });

  await t.test('a request signed with a stale timestamp far outside Stripe\'s tolerance window is rejected', async () => {
    const payload = fakeSetupIntentEvent(fakeSetupIntentId, 'setup_intent.succeeded');
    const staleSignature = signStripeWebhookPayload(
      JSON.stringify(payload),
      STRIPE_WEBHOOK_SIGNING_SECRET as string,
      Math.floor(Date.now() / 1000) - 60 * 60 * 24,
    );
    const response = await postWebhook(payload, staleSignature);
    assert.equal(response.status, 400);
  });

  await t.test(
    'a validly signed event for a SetupIntent id unknown to both this system and Stripe itself does not crash — either 200 (safely ignored as unknown) or 502 (Stripe retrieval itself failed, since the id is not real) — never a signature error',
    async () => {
      const payload = fakeSetupIntentEvent(fakeSetupIntentId, 'setup_intent.succeeded');
      const validSignature = signStripeWebhookPayload(JSON.stringify(payload), STRIPE_WEBHOOK_SIGNING_SECRET as string);
      const response = await postWebhook(payload, validSignature);
      assert.ok([200, 502].includes(response.status), `expected 200 or 502, got ${response.status}`);
    },
  );

  await t.test('an event type this system does not act on is acknowledged without error', async () => {
    const payload = { id: `evt_${randomUUID()}`, type: 'customer.created', data: { object: { id: 'cus_fake' } } };
    const validSignature = signStripeWebhookPayload(JSON.stringify(payload), STRIPE_WEBHOOK_SIGNING_SECRET as string);
    const response = await postWebhook(payload, validSignature);
    assert.equal(response.status, 200);
  });

  await t.test('a handled PaymentIntent event enters the provider retrieval path instead of being ignored', async () => {
    const payload = { id: `evt_${randomUUID()}`, type: 'payment_intent.succeeded', data: { object: { id: 'pi_fake' } } };
    const validSignature = signStripeWebhookPayload(JSON.stringify(payload), STRIPE_WEBHOOK_SIGNING_SECRET as string);
    const response = await postWebhook(payload, validSignature);
    assert.equal(response.status, 502);
  });
});

// Optional, best-effort real Stripe test-mode round trip. Only runs when
// real test secrets are already present in the environment — this suite
// never requests, prints, or invents them (see docs/PAYMENT_SETUP.md).
const STRIPE_LIVE_TEST_SECRET_KEY = process.env.STRIPE_LIVE_TEST_SECRET_KEY;
const STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET = process.env.STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET;

test('optional real Stripe test-mode round trip', { skip: !STRIPE_LIVE_TEST_SECRET_KEY || !STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET }, async (t) => {
  // This block intentionally only runs when a maintainer has already
  // configured real Stripe *test mode* secrets locally (see
  // docs/PAYMENT_SETUP.md) — never in ordinary CI, which has none.
  const ownerC = freshClient();
  let userIdC = '';
  let challengeIdC = '';
  await t.test('User C signs up and prepares a real pending commitment', async () => {
    userIdC = (await signUpAndSignIn(ownerC, testEmail('stripe-owner-c'))).userId;
    challengeIdC = (await createPendingCommitment(ownerC, userIdC)).challengeId;
  });

  let clientSecret = '';
  await t.test('create-consequence-setup-intent returns a real Stripe test-mode client secret', async () => {
    const { data, error } = await ownerC.functions.invoke('create-consequence-setup-intent', { body: { challengeId: challengeIdC } });
    assert.equal(error, null, `expected a real SetupIntent, got: ${error?.message}`);
    assert.ok(typeof data.clientSecret === 'string' && data.clientSecret.startsWith('seti_'));
    clientSecret = data.clientSecret;
  });

  await t.test('confirming the SetupIntent with a Stripe test card, then delivering the real signed webhook, authorizes the consequence', async () => {
    const setupIntentId = clientSecret.split('_secret_')[0];
    const confirmResponse = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}/confirm`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_LIVE_TEST_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'payment_method=pm_card_visa',
    });
    const confirmed = (await confirmResponse.json()) as { status?: string; last_payment_error?: unknown };
    assert.equal(confirmed.status, 'succeeded', `expected Stripe to confirm the SetupIntent, got: ${JSON.stringify(confirmed)}`);

    // The real signed event, exactly as Stripe itself would deliver it.
    const eventPayload = fakeSetupIntentEvent(setupIntentId, 'setup_intent.succeeded');
    const signature = signStripeWebhookPayload(JSON.stringify(eventPayload), STRIPE_LIVE_TEST_WEBHOOK_SIGNING_SECRET as string);
    const webhookResponse = await postWebhook(eventPayload, signature);
    assert.equal(webhookResponse.status, 200);

    const { data: consequence, error: consequenceError } = await ownerC
      .from('consequences')
      .select('authorization_status, status')
      .eq('challenge_id', challengeIdC)
      .single();
    assert.equal(consequenceError, null, `consequence lookup failed: ${consequenceError?.message}`);
    assert.equal(consequence!.authorization_status, 'authorized');
    assert.equal(consequence!.status, 'authorized');
  });
});
