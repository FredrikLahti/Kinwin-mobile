import { CurrencyCode } from './types';

/**
 * Kinwin V1's exact supported commitment-currency set — the ONE canonical
 * runtime contract every layer must import rather than defining its own
 * copy. Before this module existed, "USD only" was independently hardcoded
 * in at least this domain layer, from-onboarding-draft.ts, and six separate
 * Postgres migrations, all of which had to be kept in sync by hand. True
 * multi-currency (SEK/USD/EUR stake, Stripe charge, and Tremendous reward
 * all in the same currency, no FX) is a locked product decision — see
 * docs/PRODUCT_DECISIONS.md. This is deliberately a small, fixed set, not a
 * generic "any ISO 4217 code" system.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['USD', 'SEK', 'EUR'] as CurrencyCode[];

export type SupportedCurrency = 'USD' | 'SEK' | 'EUR';

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
