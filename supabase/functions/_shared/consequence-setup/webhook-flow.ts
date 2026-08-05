import { StripeSetupIntent, WebhookApplication, WebhookStatus } from './types.ts';

/**
 * Whether this event type is one the caller should act on at all. Must be
 * checked *before* retrieving anything from Stripe: an unrelated event
 * (e.g. `payment_intent.succeeded`) carries an object id of a different
 * kind entirely (not a SetupIntent), so attempting `retrieveSetupIntent`
 * on it would either fail outright or, worse, coincidentally succeed
 * against an unrelated object.
 */
export function isHandledSetupIntentEventType(eventType: string): boolean {
  return mapEventTypeToStatus(eventType) !== null;
}

/**
 * Maps a verified Stripe event (signature already checked by the caller)
 * plus its retrieved SetupIntent object into arguments for
 * `private.apply_consequence_setup_event`. Returns `null` for any event
 * type this system does not act on — the caller should have already used
 * {@link isHandledSetupIntentEventType} to skip retrieving anything from
 * Stripe for those, and just acknowledge with 200.
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
