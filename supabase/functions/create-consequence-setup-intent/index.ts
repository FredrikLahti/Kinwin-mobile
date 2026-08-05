// Authenticated Edge Function: creates (or reuses) a Stripe SetupIntent so
// the owner of a pending commitment can save a card for future off-session
// use. Never charges anything, never activates a challenge, and never talks
// to Stripe or writes any database row without a verified Supabase user JWT
// establishing the caller first. See docs/PAYMENT_SETUP.md for the local
// testing recipe and docs/PRODUCT_DECISIONS.md's "Consequence payment setup
// (Stripe test mode)" section for the product rules this implements.
//
// All lifecycle decisions live in two trusted RPCs
// (public.prepare_consequence_setup, public.record_consequence_setup_attempt
// — see supabase/migrations/20260810000000_consequence_setup_stripe.sql) and
// the pure orchestration in domain/consequence-setup/setup-intent-flow.ts.
// This file is deliberately thin: verify the caller, call the first RPC,
// call Stripe through the same interface that file's own unit tests use,
// call the second RPC, respond with the minimum the future client needs.
import { withSupabase } from 'npm:@supabase/server@^1';

import { runCreateSetupIntent } from '../../../domain/consequence-setup/setup-intent-flow.ts';
import { SetupPreparation } from '../../../domain/consequence-setup/types.ts';
import { createRealStripeAdapter } from '../_shared/real-stripe-adapter.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

type RequestBody = { readonly challengeId?: unknown; readonly consequenceId?: unknown };

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

/** Maps a trusted RPC's own rejection (a Postgres SQLSTATE surfaced through PostgREST) to this endpoint's own response — never a raw internal error to the caller. */
function rpcErrorResponse(error: { readonly code?: string; readonly message?: string }): Response {
  switch (error.code) {
    case 'P0002':
      // Deliberately identical whether the id is unknown or owned by
      // someone else — never discloses which.
      return jsonError(404, 'not_found', 'commitment not found');
    case '22023':
      return jsonError(400, 'invalid_state', error.message);
    case '28000':
      return jsonError(401, 'unauthorized');
    default:
      console.error('create-consequence-setup-intent: unexpected RPC error', error.code);
      return jsonError(500, 'internal_error');
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (!STRIPE_SECRET_KEY) {
      // Never leaks which secret is missing or any part of its value —
      // only that the server itself is not correctly configured.
      console.error('create-consequence-setup-intent: STRIPE_SECRET_KEY is not configured');
      return jsonError(500, 'server_configuration_error');
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'invalid_request', 'expected a JSON body');
    }

    const challengeId = typeof body.challengeId === 'string' && body.challengeId.length > 0 ? body.challengeId : null;
    const consequenceId = typeof body.consequenceId === 'string' && body.consequenceId.length > 0 ? body.consequenceId : null;
    if (!challengeId && !consequenceId) {
      return jsonError(400, 'invalid_request', 'a challengeId or consequenceId is required');
    }

    // The caller is derived from the verified JWT `withSupabase` already
    // checked — never from the request body, which carries no identity at all.
    const ownerId = ctx.userClaims?.id;
    if (!ownerId) {
      return jsonError(401, 'unauthorized');
    }

    const { data: preparationData, error: preparationError } = await ctx.supabaseAdmin.rpc('prepare_consequence_setup', {
      p_owner_id: ownerId,
      p_challenge_id: challengeId,
      p_consequence_id: consequenceId,
    });
    if (preparationError) {
      return rpcErrorResponse(preparationError);
    }

    const preparation = preparationData as SetupPreparation;
    const adapter = createRealStripeAdapter(STRIPE_SECRET_KEY);

    let result: Awaited<ReturnType<typeof runCreateSetupIntent>>;
    try {
      result = await runCreateSetupIntent({
        preparation,
        ownerId,
        newAttemptNonce: crypto.randomUUID(),
        adapter,
      });
    } catch (stripeError) {
      console.error('create-consequence-setup-intent: Stripe call failed', stripeError instanceof Error ? stripeError.message : stripeError);
      return jsonError(502, 'payment_provider_error');
    }

    // A reused (not newly created) SetupIntent was already recorded by the
    // call that originally created it — recording it again here would only
    // duplicate work, not state, but is unnecessary.
    if (!result.reused) {
      const { error: recordError } = await ctx.supabaseAdmin.rpc('record_consequence_setup_attempt', {
        p_owner_id: ownerId,
        p_challenge_id: preparation.challengeId,
        p_stripe_customer_id: result.stripeCustomerId,
        p_stripe_setup_intent_id: result.stripeSetupIntentId,
      });
      if (recordError) {
        return rpcErrorResponse(recordError);
      }
    }

    // The minimum a future client integration needs — nothing more. The
    // client secret is returned here and only here: never logged above,
    // never written to any table.
    return Response.json({ consequenceId: result.consequenceId, clientSecret: result.clientSecret });
  }),
};
