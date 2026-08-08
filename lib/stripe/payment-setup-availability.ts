export type PaymentSetupAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: 'not_configured' | 'native_required' };

/**
 * Whether the native PaymentSheet flow can actually be opened here. Checked
 * before ever touching @stripe/stripe-react-native, so a missing
 * publishable key or a web build fails honestly (a truthful message, the
 * rest of the app unaffected) instead of crashing into a native module that
 * doesn't exist. The web check wins even when a key is configured — the
 * app-owned consent/status screens still render on web for visual review,
 * but the native sheet itself must never be invoked there.
 */
export function derivePaymentSetupAvailability(input: {
  readonly isWeb: boolean;
  readonly stripeConfigured: boolean;
}): PaymentSetupAvailability {
  if (input.isWeb) return { kind: 'unavailable', reason: 'native_required' };
  if (!input.stripeConfigured) return { kind: 'unavailable', reason: 'not_configured' };
  return { kind: 'available' };
}
