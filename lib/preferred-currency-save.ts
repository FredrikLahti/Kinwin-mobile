/**
 * app/account/index.tsx's serialization guard for
 * updatePreferredCurrency(...): a second tap while a write is already in
 * flight must never start a second, concurrent database UPDATE — two
 * concurrent writes can resolve out of order, letting an earlier tap's
 * response overwrite a later one's already-persisted result. Extracted as
 * a pure function so the decision itself is directly testable without
 * rendering the screen; the real guard is exactly `if (saving) return;`.
 */
export type PreferredCurrencySaveDecision = 'proceed' | 'ignored_in_flight';

export function planPreferredCurrencySave(saving: boolean): PreferredCurrencySaveDecision {
  return saving ? 'ignored_in_flight' : 'proceed';
}
