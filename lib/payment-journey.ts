export type OwnerPaymentState = 'not_applicable' | 'processing' | 'needs_attention' | 'paid';

export type OwnerPaymentStatus = {
  readonly state: OwnerPaymentState;
};

export type PaymentStatusPresentation = {
  readonly label: string;
  readonly detail: string;
  readonly tone: 'neutral' | 'attention';
};

/**
 * Only 'needs_attention' has anything the owner should act on or even see —
 * 'processing' (the worker is still on its normal retry cadence) and 'paid'
 * are deliberately silent, so this never adds noise beyond the one real gap
 * client UX had: a stuck payment method with no reachable "fix this" path.
 */
export function describeOwnerPaymentStatus(status: OwnerPaymentStatus): PaymentStatusPresentation | null {
  if (status.state !== 'needs_attention') return null;
  return {
    label: 'Payment method needs attention',
    detail: 'Kinwin could not charge your saved card for this challenge. Update your payment method to continue.',
    tone: 'attention',
  };
}
