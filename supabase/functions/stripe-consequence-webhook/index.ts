// Stripe webhook receiver: the only path by which a saved payment method
// actually becomes `authorized`. Supabase JWT verification is disabled for
// this function alone (see supabase/config.toml's
// [functions.stripe-consequence-webhook] verify_jwt = false) — Stripe never
// sends a Supabase JWT, and its own HMAC signature is this endpoint's real
// trust boundary. The signature is verified before this file parses,
// trusts, or writes anything derived from the request body.
//
// All lifecycle decisions live in the trusted RPC
// public.apply_consequence_setup_event (see
// supabase/migrations/20260810000000_consequence_setup_stripe.sql) and the
// pure event-to-RPC-arguments mapping in
// supabase/functions/_shared/consequence-setup/webhook-flow.ts. This file
// is deliberately thin.
import Stripe from 'npm:stripe@^22';
import { withSupabase } from 'npm:@supabase/server@^1';

import { planWebhookApplication } from '../_shared/consequence-setup/webhook-flow.ts';
import { StripeSetupIntent } from '../_shared/consequence-setup/types.ts';
import { createRealStripeAdapter } from '../_shared/real-stripe-adapter.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SIGNING_SECRET = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');

// Needed to use the Web Crypto API for signature verification in Deno —
// Stripe's own current documented pattern for edge/worker runtimes.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

export default {
  // See create-consequence-setup-intent/index.ts's identical comment: the
  // `any` Database generic is needed for ctx.supabaseAdmin.rpc(...)'s
  // hand-written argument shape, since this backend has no generated
  // Supabase Database type.
  fetch: withSupabase<any>({ auth: 'none' }, async (req, ctx) => {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SIGNING_SECRET) {
      console.error('stripe-consequence-webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SIGNING_SECRET is not configured');
      return Response.json({ error: 'server_configuration_error' }, { status: 500 });
    }

    const signature = req.headers.get('Stripe-Signature');
    if (!signature) {
      return new Response('missing Stripe-Signature header', { status: 400 });
    }

    // The raw text body is required: signature verification is over the
    // exact bytes Stripe sent, not a re-serialized parse of them.
    const rawBody = await req.text();

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SIGNING_SECRET, undefined, cryptoProvider);
    } catch (err) {
      // Invalid or missing signature: reject before anything derived from
      // the body is trusted, parsed further, or written anywhere.
      console.error('stripe-consequence-webhook: signature verification failed', err instanceof Error ? err.message : err);
      return new Response('invalid signature', { status: 400 });
    }

    const objectId = (event.data.object as { readonly id?: unknown }).id;
    if (typeof objectId !== 'string') {
      // Acknowledge and drop: not a shape this endpoint can act on.
      return Response.json({ received: true });
    }

    const adapter = createRealStripeAdapter(STRIPE_SECRET_KEY);
    let setupIntent: StripeSetupIntent;
    try {
      // Re-retrieved from Stripe rather than trusted wholesale from the
      // webhook payload — the canonical, current object, not whatever
      // shape happened to be embedded in this particular delivery.
      setupIntent = await adapter.retrieveSetupIntent(objectId);
    } catch (err) {
      console.error('stripe-consequence-webhook: failed to retrieve SetupIntent', objectId, err instanceof Error ? err.message : err);
      // A transient Stripe API failure should make Stripe retry the
      // delivery rather than silently drop it.
      return new Response('failed to retrieve setup intent', { status: 502 });
    }

    const application = planWebhookApplication(event, setupIntent);
    if (!application) {
      // An event type this system does not act on: acknowledged, not retried.
      return Response.json({ received: true });
    }

    const { error } = await ctx.supabaseAdmin.rpc('apply_consequence_setup_event', {
      p_stripe_event_id: application.stripeEventId,
      p_event_type: application.eventType,
      p_stripe_setup_intent_id: application.stripeSetupIntentId,
      p_stripe_customer_id: application.stripeCustomerId,
      p_stripe_payment_method_id: application.stripePaymentMethodId,
      p_status: application.status,
    });
    if (error) {
      console.error('stripe-consequence-webhook: apply_consequence_setup_event failed', error.code, error.message);
      // An unexpected server-side failure: ask Stripe to retry.
      return new Response('internal error', { status: 500 });
    }

    // Every other outcome the RPC can report (duplicate_event,
    // unknown_setup_intent, superseded, commitment_not_pending, or a real
    // authorization/failure/cancel) is a safely handled, terminal outcome —
    // none of them should make Stripe retry this delivery.
    return Response.json({ received: true });
  }),
};
