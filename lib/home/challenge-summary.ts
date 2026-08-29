import { CurrentPeriodStatus } from '@/lib/challenge-ux-preview/view-model';
import { ChallengePeriod } from '@/domain/challenge/periods';
import { CheckInFact } from '@/domain/challenge/check-in/types';
import { ActivatedChallengeSnapshot, Weekday } from '@/domain/challenge/types';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

function lowerFirst(text: string): string {
  return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

function joinWeekdays(days: readonly Weekday[]): string {
  const labels = days.map((day) => WEEKDAY_LABELS[day]);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

export type ChallengeIdentity = {
  /** What the user is doing/limiting/avoiding — the primary line. */
  readonly headline: string;
  /** The rule itself (frequency for Build, ceiling for Limit). Null for Avoid, where the headline already states the whole rule. */
  readonly ruleDetail: string | null;
};

/**
 * Build/Limit/Avoid-aware challenge identity for Home, challenge detail, and
 * Kin activity cards — derived from the persisted, structured
 * `ChallengeRule`/`behavior` fields, never by re-parsing a display string.
 * Avoid never invents a completion count ("0 of 1"); its rule is
 * maintaining zero, so it gets a single line. Takes only `behavior` (not
 * the full snapshot) so it can also run directly against a
 * social_activity payload, which carries the same `behavior` shape
 * verbatim but nothing else about the challenge.
 */
export function describeChallengeIdentity(challenge: Pick<ActivatedChallengeSnapshot, 'behavior'>): ChallengeIdentity {
  const description = challenge.behavior.description.trim();
  const rule = challenge.behavior.rule;

  if (rule.direction === 'build') {
    const { rhythm } = rule;
    const ruleDetail = rhythm.type === 'daily'
      ? 'Every day'
      : rhythm.type === 'weekly_count'
        ? `${rhythm.target} ${rhythm.target === 1 ? 'time' : 'times'} per week`
        : joinWeekdays(rhythm.weekdays);
    return { headline: description, ruleDetail };
  }

  if (rule.direction === 'cut_back') {
    const unit = rule.measurement.unit;
    const ruleDetail = `Up to ${rule.boundary.maximumValue} ${unit} per ${rule.boundary.periodUnit}`;
    return { headline: description, ruleDetail };
  }

  // stop
  return { headline: `No ${lowerFirst(description)}`, ruleDetail: null };
}

/**
 * Compact recipient names for a header/summary line — scales the same way
 * whether there are 1 or 4 recipients, unlike a prose sentence whose
 * grammar has to change with the count (see app/create/review.tsx's
 * identical convention, duplicated here rather than imported since Home
 * must not depend on onboarding-flow files).
 */
export function formatRecipientsCompact(names: readonly string[]): string {
  if (names.length === 0) return 'Your recipients';
  if (names.length <= 2) return names.join(', ');
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export function describeExperienceCategory(category: ActivatedChallengeSnapshot['consequenceCategory']): string {
  switch (category) {
    case 'dinner': return 'Dinner';
    case 'adventure': return 'Adventure';
    case 'culture': return 'Culture';
    case 'getaway': return 'Getaway';
    case 'wellness': return 'Wellness';
  }
}

export function formatMoney(minorUnits: number, currency: string): string {
  try {
    return (minorUnits / 100).toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  } catch {
    return `$${(minorUnits / 100).toFixed(0)}`;
  }
}

export type ConsequenceSummary = {
  readonly recipientsCompact: string;
  readonly categoryLabel: string;
  readonly stakeLabel: string;
};

/**
 * Structured, non-prose consequence facts — never a sentence like "Mom gets
 * $200" (misleading: the stake funds an experience, it is not handed over
 * as cash) and never claiming a charge already happened. Matches the
 * locked pattern from app/create/review.tsx's recap.
 */
export function describeConsequence(challenge: ActivatedChallengeSnapshot): ConsequenceSummary {
  const names = challenge.recipients.map((r) => r.name.trim()).filter(Boolean);
  return {
    recipientsCompact: formatRecipientsCompact(names),
    categoryLabel: describeExperienceCategory(challenge.consequenceCategory),
    stakeLabel: formatMoney(challenge.stake.minorUnits, challenge.stake.currency),
  };
}

export type StatusTone = 'neutral' | 'success' | 'failure';

/**
 * Crimson is reserved for genuinely destructive/failure semantics — see
 * theme-v2.ts's locked color rules — so routine in-progress copy (calm,
 * check-in due, already reported) must never borrow it. Only an actual
 * missed deadline or an on-record lapse counts as failure; only a closed,
 * met period counts as success.
 */
export function statusTone(kind: CurrentPeriodStatus['kind']): StatusTone {
  if (kind === 'missed' || kind === 'closed_not_satisfied' || kind === 'stop_lapse_on_record') return 'failure';
  if (kind === 'closed_satisfied') return 'success';
  return 'neutral';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The Y/M/D a UTC instant reads as in a given IANA timezone — never the
 * device's own zone or raw UTC calendar days, since a period boundary is
 * always the challenge's own frozen timezone (see
 * docs/PRODUCT_DECISIONS.md's "Timezone, start, and DST rules"). Used only
 * for day-granularity comparisons below. Wrapped in try/catch like
 * formatMoney's own Intl call: Intl.DateTimeFormat().formatToParts() is not
 * guaranteed to be present in every Hermes/ICU build this app ships on. The
 * fallback reads the instant's own UTC calendar day instead of its
 * `timeZone`-local one — an approximation only reached if Intl genuinely
 * can't do the real conversion, not a crash.
 */
function localCalendarDayUtcMs(iso: string, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'));
  } catch {
    const date = new Date(iso);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
}

/**
 * "Starts today" / "Starts Monday" instead of a bare, unexplained "Not
 * started yet" — a period that has not started is a normal, expected state
 * (a specific-days build's first scheduled day can fall after activation,
 * even though the challenge itself is active immediately — see
 * docs/PRODUCT_DECISIONS.md's "Timezone, start, and DST rules"), not an
 * error, so naming the real date answers "why can't I check in?" honestly.
 * Must compare calendar days in the challenge's own timezone —
 * comparing raw UTC calendar days undercounts for any timezone ahead of
 * UTC (e.g. a period starting 22:00 UTC is already the next calendar day
 * in Europe/Stockholm, so a same-UTC-day comparison would wrongly say
 * "today" instead of "tomorrow"). Falls back to a short date beyond a
 * week out.
 */
export function describeUpcomingStart(startsAtIso: string, nowIso: string, timezone: string): string {
  const startDayMs = localCalendarDayUtcMs(startsAtIso, timezone);
  const nowDayMs = localCalendarDayUtcMs(nowIso, timezone);
  const diffDays = Math.round((startDayMs - nowDayMs) / MS_PER_DAY);
  if (diffDays <= 0) return 'Starts today';
  if (diffDays === 1) return 'Starts tomorrow';
  const start = new Date(startsAtIso);
  if (diffDays < 7) return `Starts ${new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(start)}`;
  return `Starts ${new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'short', day: 'numeric' }).format(start)}`;
}

function factOf(status: CurrentPeriodStatus): CheckInFact | null {
  return 'fact' in status ? status.fact : null;
}

/**
 * Human, type-appropriate progress for the challenge detail screen — never
 * "periods closed" or "lapses" (internal reporting-engine vocabulary).
 * Returns null when there is nothing truthful and meaningful to say yet
 * (e.g. a just-activated challenge with no closed periods): showing
 * nothing is better than surfacing raw engine counters. Avoid never gets a
 * line here — "maintaining zero" has no progress metric beyond the
 * headline already shown, and inventing one (e.g. "0 of 1") would be
 * exactly the kind of internal framing this exists to remove.
 */
export function describeProgress(
  challenge: ActivatedChallengeSnapshot,
  currentPeriodStatus: CurrentPeriodStatus,
  progress: { readonly periodsClosed: number; readonly periodsMet: number },
  focusPeriod: ChallengePeriod | null,
): string | null {
  const rule = challenge.behavior.rule;
  const fact = factOf(currentPeriodStatus);

  if (rule.direction === 'build') {
    if (focusPeriod?.target.type === 'completion_target' && focusPeriod.target.target > 1 && fact?.kind === 'build_completion') {
      const periodWord = focusPeriod.periodKind === 'week' ? 'week' : 'period';
      return `${fact.completions} of ${focusPeriod.target.target} this ${periodWord}`;
    }
    if (progress.periodsClosed > 0) {
      const unit = focusPeriod?.periodKind === 'day' ? 'day' : 'week';
      return `Kept it ${progress.periodsMet} of ${progress.periodsClosed} ${unit}${progress.periodsClosed === 1 ? '' : 's'}`;
    }
    return null;
  }

  if (rule.direction === 'cut_back') {
    if (fact?.kind === 'cut_back_total' && focusPeriod) {
      const periodLabel = focusPeriod.periodKind === 'week' ? 'this week' : 'today';
      return `${fact.total} of ${rule.boundary.maximumValue} ${rule.measurement.unit} ${periodLabel}`;
    }
    return `Stay under ${rule.boundary.maximumValue} ${rule.measurement.unit} per ${rule.boundary.periodUnit}`;
  }

  return null;
}

/**
 * Home's hero progress bar fill (0-100), from the same real
 * periodsClosed/periodsTotal counts as describeProgress — never a separate
 * estimate. Null (hide the bar) whenever there is nothing generated yet to
 * divide by, rather than showing a misleading 0% or dividing by zero. Also
 * null for Stop: it is a single continuous period that only closes when the
 * whole challenge ends, so periodsClosed/periodsTotal would sit at a flat,
 * misleading 0% for the entire active duration regardless of real elapsed
 * time — the same reason describeProgress and describeDurationPosition
 * already withhold a period-based metric for this direction.
 */
export function computeHeroProgressPercent(
  direction: ActivatedChallengeSnapshot['successRule']['direction'],
  periodsClosed: number,
  periodsTotal: number,
): number | null {
  if (direction === 'stop' || periodsTotal <= 0) return null;
  return Math.max(0, Math.min(100, (periodsClosed / periodsTotal) * 100));
}

/**
 * "Week 2 of 4" / "Day 12 of 28" — the challenge's real generated period
 * position, never a recomputed estimate. Null for Avoid (a single
 * continuous period has no meaningful position beyond the dates/time
 * already shown).
 */
export function describeDurationPosition(focusPeriod: ChallengePeriod | null, periodsTotal: number): string | null {
  if (!focusPeriod || periodsTotal <= 0) return null;
  if (focusPeriod.periodKind === 'week') return `Week ${focusPeriod.periodNumber} of ${periodsTotal}`;
  if (focusPeriod.periodKind === 'day') return `Day ${focusPeriod.periodNumber} of ${periodsTotal}`;
  return null;
}
