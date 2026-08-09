import { CurrentPeriodStatus } from '@/lib/challenge-ux-preview/view-model';
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
 * Build/Limit/Avoid-aware challenge identity for Home and challenge detail —
 * derived from the persisted, structured `ChallengeRule`/`behavior` fields,
 * never by re-parsing a display string. Avoid never invents a completion
 * count ("0 of 1"); its rule is maintaining zero, so it gets a single line.
 */
export function describeChallengeIdentity(challenge: ActivatedChallengeSnapshot): ChallengeIdentity {
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

function describeExperienceCategory(category: ActivatedChallengeSnapshot['consequenceCategory']): string {
  switch (category) {
    case 'dinner': return 'Dinner';
    case 'adventure': return 'Adventure';
    case 'culture': return 'Culture';
    case 'getaway': return 'Getaway';
    case 'wellness': return 'Wellness';
  }
}

function formatMoney(minorUnits: number, currency: string): string {
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
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Starts tomorrow" / "Starts Monday" instead of a bare, unexplained "Not
 * started yet" — a period that has not started is a normal, expected state
 * (every activation's first period starts at the next local midnight), not
 * an error, so naming the real date answers "why can't I check in?" hon
 * estly. Falls back to a short date beyond a week out.
 */
export function describeUpcomingStart(startsAtIso: string, nowIso: string): string {
  const start = new Date(startsAtIso);
  const now = new Date(nowIso);
  const startUtcDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((startUtcDay - nowUtcDay) / MS_PER_DAY);
  if (diffDays <= 0) return 'Starts today';
  if (diffDays === 1) return 'Starts tomorrow';
  if (diffDays < 7) return `Starts ${WEEKDAY_NAMES[start.getUTCDay()]}`;
  return `Starts ${start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
}
