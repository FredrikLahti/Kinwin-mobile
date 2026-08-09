/**
 * The three outcomes `presentPaymentSheet()` can resolve with, collapsed
 * from @stripe/stripe-react-native's own `PaymentSheetError` codes
 * ('Canceled' | 'Failed' | 'Timeout') into what this app actually needs to
 * tell apart: a user-initiated cancel (return to consent, no alarming
 * error), a real failure (retryable error, commitment untouched), or a
 * genuine completion (enter verification — never "authorized" directly).
 */
export type PaymentSheetOutcome = 'canceled' | 'failed' | 'completed';

export function classifyPaymentSheetPresentResult(error: { readonly code?: string } | null | undefined): PaymentSheetOutcome {
  if (!error) return 'completed';
  if (error.code === 'Canceled') return 'canceled';
  return 'failed';
}
