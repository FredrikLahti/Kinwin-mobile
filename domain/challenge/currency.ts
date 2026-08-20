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

/**
 * Kinwin V1's ONE canonical minimum-stake contract, in minor units, keyed
 * by currency — the only place a floor is ever defined. Enforced
 * identically in domain/challenge/from-onboarding-draft.ts (client-side
 * mapping), domain/challenge/validation.ts (activation readiness), the
 * stake-entry screen (app/create/consequence.tsx), and independently
 * re-enforced server-side in prepare_challenge_from_draft — never trust
 * the client's own check alone.
 *
 * This is a PRODUCT floor, not merely Stripe's technical minimum charge
 * (which the docs list as USD/EUR 0.50 and SEK 3.00): a 1 USD or 3 SEK
 * "accountability stake" is not a meaningful commitment, and Stripe's own
 * minimum can move or, when currency conversion into the account's
 * settlement currency is required, be superseded by the equivalent
 * settlement-currency minimum — a number Kinwin cannot resolve without a
 * live FX lookup, which V1 deliberately never performs (see
 * docs/PRODUCT_DECISIONS.md's "True multi-currency V1"). Choosing a floor
 * comfortably above the provider minimum, independently and statically
 * per currency, means Kinwin never needs to track (or risk falling below)
 * a moving provider threshold at all.
 *
 * No stronger existing product decision on stake range was found in this
 * repository (existing fixtures/examples commonly use a $75 stake, but
 * that is illustrative test data, not a documented floor) — these are a
 * conservative, explicit V1 floor, chosen independently per currency
 * (never derived by converting one into another): $5 / €5 / 50 kr. Each
 * is a whole-unit amount the existing stake-entry UI already supports,
 * deterministic, and safely clear of every provider minimum above.
 */
export const MINIMUM_STAKE_MINOR_UNITS: Readonly<Record<SupportedCurrency, number>> = {
  USD: 500,
  EUR: 500,
  SEK: 5000,
};

/** The same floor expressed in whole major units, for display/comparison against the whole-unit stake-entry field. */
export function minimumStakeMajorUnits(currency: SupportedCurrency): number {
  return MINIMUM_STAKE_MINOR_UNITS[currency] / 100;
}

export function isStakeAtOrAboveMinimum(minorUnits: number, currency: SupportedCurrency): boolean {
  return minorUnits >= MINIMUM_STAKE_MINOR_UNITS[currency];
}
