import { StripeSetupIntent, WebhookApplication, WebhookStatus } from './types.ts';

/**
 * Maps a verified Stripe event (signature already checked by the caller)
 * plus its retrieved SetupIntent object into arguments for
 * `private.apply_consequence_setup_event`. Returns `null` for any event
 * type this system does not act on — the caller should acknowledge those
 * with 200 and do nothing else.
 */
export function planWebhookApplication(
  event: { readonly id: string; readonly type: string },
  setupIntent: StripeSetupIntent,
): WebhookApplication | null {
  const status = mapEventTypeToStatus(event.type);
  if (!status) return null;

  return {
    stripeEventId: event.id,
    eventType: event.type,
    stripeSetupIntentId: setupIntent.id,
    stripeCustomerId: setupIntent.customerId,
    stripePaymentMethodId: setupIntent.paymentMethodId,
    status,
  };
}

function mapEventTypeToStatus(eventType: string): WebhookStatus | null {
  switch (eventType) {
    case 'setup_intent.succeeded':
      return 'succeeded';
    case 'setup_intent.setup_failed':
      return 'failed';
    case 'setup_intent.canceled':
      return 'canceled';
    default:
      return null;
  }
}
