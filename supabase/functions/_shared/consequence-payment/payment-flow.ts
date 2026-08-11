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

export async function attemptObligation(obligation: PaymentObligation, adapter: StripePaymentAdapter) {
  const intent = obligation.stripePaymentIntentId
    ? await adapter.confirmPaymentIntent(obligation.stripePaymentIntentId, { paymentMethodId: obligation.stripePaymentMethodId })
    : await adapter.createPaymentIntent({
      customerId: obligation.stripeCustomerId, paymentMethodId: obligation.stripePaymentMethodId,
      amount: obligation.amountMinorUnits, currency: obligation.currency.toLowerCase(),
      idempotencyKey: `kinwin-failure-payment:${obligation.obligationId}`,
      metadata: { challenge_id: obligation.challengeId, payment_obligation_id: obligation.obligationId },
    });
  if (intent.customerId !== obligation.stripeCustomerId) throw new Error('stripe_customer_mismatch');
  return { intentId:intent.id, ...classifyPaymentIntent(intent) };
}

export function planPaymentWebhook(event:{readonly id:string;readonly type:string}, intent:StripePaymentIntent) {
  if (!['payment_intent.succeeded','payment_intent.processing','payment_intent.payment_failed'].includes(event.type)) return null;
  return { stripeEventId:event.id,eventType:event.type,stripePaymentIntentId:intent.id,stripeCustomerId:intent.customerId,...classifyPaymentIntent(intent) };
}
