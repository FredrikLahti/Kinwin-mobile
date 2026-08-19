import { SupportedCurrency } from '@/domain/challenge/currency';

// Deliberately small and deterministic — not a generic locale/region
// framework. True multi-currency V1 only supports USD/SEK/EUR (see
// domain/challenge/currency.ts), so this only needs to decide between
// those three when a user has no saved preference yet.
const EURO_AREA_REGIONS = new Set([
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'HR',
]);

/** Best-effort ISO 3166 region for a locale string, without adding expo-localization. Intl.Locale#maximize fills in a likely region even for a region-less locale like "sv" (→ "SE"); a manual hyphen/underscore split is the fallback for engines without Intl.Locale. */
function regionFromLocale(locale: string): string | null {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region ?? null;
  } catch {
    const last = locale.split(/[-_]/).at(-1);
    return last && last.length === 2 ? last.toUpperCase() : null;
  }
}

export function currencyForRegion(region: string | null): SupportedCurrency {
  if (region === 'SE') return 'SEK';
  if (region && EURO_AREA_REGIONS.has(region)) return 'EUR';
  return 'USD';
}

/**
 * The default currency for a brand-new challenge draft — never a live
 * reference from an existing draft/challenge (see
 * docs/PRODUCT_DECISIONS.md). A saved profiles.preferred_currency always
 * wins; only in its absence does this fall back to the device's own
 * locale/region. Called once, at the "start fresh" boundary
 * (hooks/use-create-challenge-entry.ts) — never inside the pure onboarding
 * reset functions, which must stay synchronous and side-effect free.
 */
export function resolveDefaultCurrency(
  savedPreference: SupportedCurrency | null,
  locale: string = Intl.DateTimeFormat().resolvedOptions().locale,
): SupportedCurrency {
  if (savedPreference) return savedPreference;
  return currencyForRegion(regionFromLocale(locale));
}
