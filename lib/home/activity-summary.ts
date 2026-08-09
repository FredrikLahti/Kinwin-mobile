import { describeExperienceCategory, formatMoney } from '@/lib/home/challenge-summary';
import { ActivityItem } from '@/lib/supabase/kin-repository';

/**
 * The single line under a Kin activity card's WHO/WHAT header — shared by
 * the Kin tab and Home's small "From your Kin" module so the two never
 * drift. Failure is never softened into a generic consolation line (see
 * docs/PRODUCT_DECISIONS.md's social section): it states what happens next
 * when that's known, using the same locked, product-safe consequence facts
 * the payload already carries (recipient display names, category, stake —
 * never payment or contact data).
 */
export function describeActivityEvent(item: ActivityItem): string {
  if (item.kind === 'challenge_started') return 'Started';
  if (item.kind === 'challenge_succeeded') return 'Completed it';
  if (item.consequence) {
    const names = item.consequence.recipientNames.join(', ') || 'their Kin';
    const category = describeExperienceCategory(item.consequence.category).toLowerCase();
    const stake = formatMoney(item.consequence.stake.minorUnits, item.consequence.stake.currency);
    return `Missed it. ${names} get a ${category} worth ${stake}.`;
  }
  return 'Missed it.';
}
