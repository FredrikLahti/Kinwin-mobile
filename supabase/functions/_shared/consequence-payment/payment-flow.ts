import type { StripePaymentAdapter, StripePaymentIntent } from '../consequence-setup/types.ts';

export type PaymentStatus = 'processing'|'succeeded'|'temporary_failure'|'requires_action'|'requires_payment_method'|'permanently_failed';
export type PaymentObligation = { readonly obligationId:string; readonly challengeId:string; readonly ownerId:string;
 readonly amountMinorUnits:number; readonly currency:string; readonly stripeCustomerId:string;
 readonly stripePaymentMethodId:string; readonly stripePaymentIntentId:string|null; readonly retryCount:number };

export function classifyPaymentIntent(intent: StripePaymentIntent): { status: PaymentStatus; category: string|null } {
  switch (intent.status) {
    case 'succeeded': return { status:'succeeded', category:null };
    case 'processing': return { status:'processing', category:null };
    case 'requires_action': return { status:'requires_action', category:'authentication_required' };
    case 'requires_payment_method':
      return intent.lastErrorCode === 'authentication_required'
        ? { status:'requires_action', category:'authentication_required' }
        : { status:'requires_payment_method', category:'payment_method_required' };
    case 'canceled': return { status:'permanently_failed', category:'payment_intent_canceled' };
    default: return { status:'temporary_failure', category:'provider_temporarily_unavailable' };
  }
}

// Stripe's own deterministic client-input validation errors — a request
// Stripe rejects outright (HTTP 4xx invalid_request_error) before a
// PaymentIntent object ever exists, so classifyPaymentIntent's own
// intent.status-based classification never even runs for these. No amount
// of retrying fixes a request Stripe has already declared malformed, so
// these must be terminal, not temporary — see the codes Stripe documents
// for its minimum-charge-amount rejection specifically (amount_too_small)
// plus the small set of other structurally-invalid-request codes that are
// equally never retry-fixable. Deliberately narrow: only these specific,
// well-understood deterministic codes are reclassified — every other
// thrown error (network failures, rate limits, 5xx, or anything with an
// unrecognized shape) keeps the previous, safe default of temporary_failure.
const DETERMINISTIC_INVALID_REQUEST_CODES = new Set([
  'amount_too_small',
  'amount_too_large',
  'parameter_invalid_integer',
  'parameter_missing',
]);

/**
 * Duck-typed against the shape of a Stripe SDK error (`.code`) — never
 * imports the real `stripe` package (Deno-only) into this Node-testable
 * module. Returns null for anything NOT recognized as one of the narrow
 * deterministic codes above, so the caller can rethrow and preserve the
 * existing, safe "genuinely uncertain → treat as transient" behavior for
 * every other error shape (network failures, rate limits, 5xx, or a plain
 * Error with no `.code` at all) — this function only ever narrows, never
 * broadens, what counts as terminal.
 */
function classifyDeterministicProviderError(error: unknown): { status: PaymentStatus; category: string } | null {
  const shape = error as { readonly code?: unknown } | null;
  const code = typeof shape?.code === 'string' ? shape.code : null;
  if (code && DETERMINISTIC_INVALID_REQUEST_CODES.has(code)) {
    return { status: 'permanently_failed', category: code };
  }
  return null;
}

export async function attemptObligation(obligation: PaymentObligation, adapter: StripePaymentAdapter) {
  let intent: StripePaymentIntent;
  try {
    intent = obligation.stripePaymentIntentId
      ? await adapter.confirmPaymentIntent(obligation.stripePaymentIntentId, { paymentMethodId: obligation.stripePaymentMethodId })
      : await adapter.createPaymentIntent({
        customerId: obligation.stripeCustomerId, paymentMethodId: obligation.stripePaymentMethodId,
        amount: obligation.amountMinorUnits, currency: obligation.currency.toLowerCase(),
        idempotencyKey: `kinwin-failure-payment:${obligation.obligationId}`,
        metadata: { challenge_id: obligation.challengeId, payment_obligation_id: obligation.obligationId },
      });
  } catch (error) {
    const deterministic = classifyDeterministicProviderError(error);
    if (deterministic) return { intentId: null as string | null, ...deterministic };
    throw error;
  }
  if (intent.customerId !== obligation.stripeCustomerId) throw new Error('stripe_customer_mismatch');
  return { intentId:intent.id as string | null, ...classifyPaymentIntent(intent) };
}

export function planPaymentWebhook(event:{readonly id:string;readonly type:string}, intent:StripePaymentIntent) {
  if (!['payment_intent.succeeded','payment_intent.processing','payment_intent.payment_failed'].includes(event.type)) return null;
  return { stripeEventId:event.id,eventType:event.type,stripePaymentIntentId:intent.id,stripeCustomerId:intent.customerId,...classifyPaymentIntent(intent) };
}
