// Presentation adapter for the isolated /challenge-ux-preview prototype.
// This file formats and selects; it never recomputes satisfied / not_satisfied
// / success / failure itself. Every status shown to the user is derived by
// calling the real, merged check-in engine (`derivePeriodState`,
// `evaluateChallenge`, `resolveStopHistory`, `reduceEffectiveFact`) from
// `domain/challenge/check-in` and `domain/challenge/results.ts` — see
// docs/CHALLENGE_CHECKIN_UX.md for the full write-up of the domain/fixture
// boundary this file sits on.

// Relative imports throughout (not the app's usual `@/` alias): this module
// is compiled and run directly by `node --test` (see tsconfig.test.json /
// package.json's `test` script), which has no knowledge of the `@/` path
// alias — only a bundler (Metro) resolves that. `@/` is safe from app/
// screens because Metro handles it; a plain-value import of it here would
// fail at test runtime with `MODULE_NOT_FOUND`.
import { ChallengePeriod } from '../../domain/challenge/periods';
import { compareIso } from '../../domain/challenge/check-in/iso-time';
import { derivePeriodState, EffectivePeriodState } from '../../domain/challenge/check-in/period-state';
import { reduceEffectiveFact } from '../../domain/challenge/check-in/reduction';
import { resolveStopHistory } from '../../domain/challenge/check-in/stop-reduction';
import { CheckInEvent, CheckInFact } from '../../domain/challenge/check-in/types';
import { evaluateChallenge } from '../../domain/challenge/results';
import { ActivatedChallengeSnapshot, ChallengePeriodId, CheckInId, IsoDateTime } from '../../domain/challenge/types';

export type ChallengeUxPreviewInput = {
  readonly challenge: ActivatedChallengeSnapshot;
  readonly periods: readonly ChallengePeriod[];
  readonly events: readonly CheckInEvent[];
  readonly now: IsoDateTime;
};

/**
 * What the current focus period looks like right now, in product terms —
 * never a raw `EffectivePeriodState.kind`. Two states exist purely to keep
 * "period ended, reporting still open" (grace) distinct from "reporting
 * deadline passed with no input" (missed) — collapsing them would turn a
 * legitimate late check-in window into a false failure notice.
 */
export type CurrentPeriodStatus =
  | { readonly kind: 'upcoming' }
  | { readonly kind: 'calm' }
  | { readonly kind: 'check_in_due' }
  | { readonly kind: 'reported'; readonly fact: CheckInFact }
  | { readonly kind: 'late_check_in' }
  | { readonly kind: 'late_reported'; readonly fact: CheckInFact }
  | { readonly kind: 'missed' }
  | { readonly kind: 'closed_satisfied'; readonly fact: CheckInFact }
  | { readonly kind: 'closed_not_satisfied'; readonly fact: CheckInFact }
  | { readonly kind: 'stop_lapse_on_record' }
  | { readonly kind: 'stop_final_attestation_due' }
  | { readonly kind: 'error' };

export type CorrectionTarget = { readonly eventId: CheckInId; readonly fact: CheckInFact };

export type CorrectionAvailability =
  | { readonly available: false }
  | { readonly available: true; readonly targets: readonly CorrectionTarget[] };

export type NextAction = {
  readonly kind: 'none' | 'check_in' | 'late_check_in' | 'stop_final_attestation';
  readonly label: string;
  readonly detail: string;
};

export type ProgressSummary = {
  readonly periodsClosed: number;
  readonly periodsTotal: number;
  readonly periodsMet: number;
  readonly streakLabel: string | null;
  readonly aggregateLabel: string;
};

export type ActiveChallengeViewModel = {
  readonly direction: 'build' | 'cut_back' | 'stop';
  readonly goal: string;
  readonly promise: string;
  readonly focusPeriodId: ChallengePeriodId;
  readonly currentPeriodHeadline: string;
  readonly currentPeriodStatus: CurrentPeriodStatus;
  readonly currentPeriodCopy: string;
  readonly nextAction: NextAction;
  readonly consequenceSummary: string;
  readonly timeRemaining: string;
  readonly progress: ProgressSummary;
  readonly correction: CorrectionAvailability;
  readonly finalResult: { readonly status: 'success' | 'failure' } | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Deliberately reads UTC components — fixture instants are all `Z`, and this keeps copy deterministic in tests regardless of the host machine's timezone. */
function formatClockTime(iso: IsoDateTime): string {
  const d = new Date(iso);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12}:00 ${meridiem}` : `${hour12}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

function daysBetween(fromIso: IsoDateTime, toIso: IsoDateTime): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

function formatMoney(minorUnits: number, currency: string): string {
  try {
    return (minorUnits / 100).toLocaleString('en-US', { style: 'currency', currency });
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

/** Picks which generated period to foreground. Pure time-comparison selection over already-computed boundaries — not a second rules engine. */
function selectFocusPeriod(periods: readonly ChallengePeriod[], now: IsoDateTime): ChallengePeriod {
  const ordered = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);
  const openOne = ordered.find((p) => compareIso(now, p.startsAt) >= 0 && compareIso(now, p.reportingClosesAt) < 0);
  if (openOne) return openOne;
  const upcoming = ordered.find((p) => compareIso(now, p.startsAt) < 0);
  if (upcoming) return upcoming;
  return ordered[ordered.length - 1];
}

function isClosedState(state: EffectivePeriodState): state is Extract<EffectivePeriodState, { kind: 'satisfied' | 'not_satisfied' | 'closed_without_input' }> {
  return state.kind === 'satisfied' || state.kind === 'not_satisfied' || state.kind === 'closed_without_input';
}

function buildOrCutBackStatus(
  period: ChallengePeriod,
  eventsForPeriod: readonly CheckInEvent[],
  state: EffectivePeriodState,
  now: IsoDateTime,
): { status: CurrentPeriodStatus; correction: CorrectionAvailability } {
  const NO_CORRECTION: CorrectionAvailability = { available: false };
  switch (state.kind) {
    case 'upcoming':
      return { status: { kind: 'upcoming' }, correction: NO_CORRECTION };
    case 'closed_without_input':
      return { status: { kind: 'missed' }, correction: NO_CORRECTION };
    case 'satisfied':
      return { status: { kind: 'closed_satisfied', fact: state.fact }, correction: NO_CORRECTION };
    case 'not_satisfied':
      return { status: { kind: 'closed_not_satisfied', fact: state.fact }, correction: NO_CORRECTION };
    case 'open': {
      const trackingEnded = compareIso(now, period.endsAt) >= 0;
      if (state.fact === null) {
        if (trackingEnded) return { status: { kind: 'late_check_in' }, correction: NO_CORRECTION };
        const dailyCadence = period.periodKind === 'day';
        return { status: dailyCadence ? { kind: 'check_in_due' } : { kind: 'calm' }, correction: NO_CORRECTION };
      }
      const reduction = reduceEffectiveFact(period.id, eventsForPeriod);
      const correction: CorrectionAvailability = reduction.ok && reduction.effective
        ? { available: true, targets: [{ eventId: reduction.effective.winningEventId, fact: reduction.effective.fact }] }
        : NO_CORRECTION;
      const status: CurrentPeriodStatus = trackingEnded
        ? { kind: 'late_reported', fact: state.fact }
        : { kind: 'reported', fact: state.fact };
      return { status, correction };
    }
  }
}

function stopStatus(
  period: ChallengePeriod,
  eventsForPeriod: readonly CheckInEvent[],
  state: EffectivePeriodState,
  now: IsoDateTime,
): { status: CurrentPeriodStatus; correction: CorrectionAvailability } {
  const NO_CORRECTION: CorrectionAvailability = { available: false };
  if (state.kind === 'upcoming') return { status: { kind: 'upcoming' }, correction: NO_CORRECTION };
  if (state.kind === 'closed_without_input') return { status: { kind: 'missed' }, correction: NO_CORRECTION };
  if (state.kind === 'satisfied') return { status: { kind: 'closed_satisfied', fact: state.fact }, correction: NO_CORRECTION };
  if (state.kind === 'not_satisfied') return { status: { kind: 'closed_not_satisfied', fact: state.fact }, correction: NO_CORRECTION };

  // state.kind === 'open': the sticky-lapse and final-attestation-window
  // rules only exist in `resolveStopHistory` (`derivePeriodState`'s single
  // rolled-up `open`/fact isn't rich enough for the UI's distinct "lapse on
  // record" vs "final attestation still due" states), so this is called
  // directly here — same engine, not a second one.
  const history = resolveStopHistory(period, eventsForPeriod);
  if (!history.ok) return { status: { kind: 'error' }, correction: NO_CORRECTION };

  const targets: CorrectionTarget[] = [...history.validCorrectionTargets].map((eventId) => {
    const ev = eventsForPeriod.find((e) => e.id === eventId);
    return { eventId, fact: ev ? ev.fact : { kind: 'stop_intact' as const } };
  });
  const correction: CorrectionAvailability = targets.length > 0 ? { available: true, targets } : NO_CORRECTION;

  if (history.hasUncorrectedLapse) return { status: { kind: 'stop_lapse_on_record' }, correction };
  const trackingEnded = compareIso(now, period.endsAt) >= 0;
  if (trackingEnded) return { status: { kind: 'stop_final_attestation_due' }, correction };
  return { status: { kind: 'calm' }, correction };
}

function nextActionFor(direction: ActivatedChallengeSnapshot['successRule']['direction'], status: CurrentPeriodStatus, period: ChallengePeriod, now: IsoDateTime): NextAction {
  const deadline = formatClockTime(period.reportingClosesAt);
  switch (status.kind) {
    case 'upcoming':
      return { kind: 'none', label: '', detail: 'This period starts soon.' };
    case 'calm':
      return { kind: 'none', label: '', detail: "You're up to date. Nothing is needed right now." };
    case 'check_in_due':
      return {
        kind: 'check_in',
        label: direction === 'cut_back' ? 'Log today' : 'Check in',
        detail: 'A quick check-in keeps your promise on record.',
      };
    case 'reported':
      return { kind: 'none', label: '', detail: "You're up to date." };
    case 'late_check_in':
      return {
        kind: 'late_check_in',
        label: 'Check in now',
        detail: `${period.periodKind === 'week' ? 'This period' : 'Yesterday'} is complete. You can still check in until ${deadline}.`,
      };
    case 'late_reported':
      return { kind: 'none', label: '', detail: `Recorded. You can still correct it until ${deadline}.` };
    case 'missed':
      return { kind: 'none', label: '', detail: 'No check-in was received before the deadline, so this period counts as not met.' };
    case 'closed_satisfied':
      return { kind: 'none', label: '', detail: 'This period is complete and on record.' };
    case 'closed_not_satisfied':
      return { kind: 'none', label: '', detail: 'This period closed without meeting the promise.' };
    case 'stop_lapse_on_record':
      return { kind: 'none', label: '', detail: 'A lapse is on record. Correction is available only if it was reported by accident.' };
    case 'stop_final_attestation_due':
      return {
        kind: 'stop_final_attestation',
        label: 'Give final answer',
        detail: `Tracking has ended. Confirm before ${deadline}.`,
      };
    case 'error':
      return { kind: 'none', label: '', detail: 'Something in this check-in history needs attention.' };
  }
}

function currentPeriodHeadline(period: ChallengePeriod): string {
  // Deliberately not "Your promise" — that label is already used above this
  // section for the behavior itself (see app/challenge-ux-preview/home.tsx);
  // reusing it here for Stop's single continuous period read as a copy bug.
  if (period.periodKind === 'continuous') return 'Right now';
  if (period.periodKind === 'day') return 'Today';
  return 'This week';
}

function currentPeriodCopy(
  direction: ActivatedChallengeSnapshot['successRule']['direction'],
  period: ChallengePeriod,
  status: CurrentPeriodStatus,
): string {
  if (direction === 'build') {
    const target = period.target.type === 'completion_target' ? period.target.target : 0;
    switch (status.kind) {
      case 'upcoming': return 'Not started yet.';
      case 'calm': return `Report your total anytime this ${period.periodKind === 'week' ? 'week' : 'period'} — no need to check in yet.`;
      case 'check_in_due': return 'Not logged yet today.';
      case 'reported':
      case 'late_reported': {
        const completions = status.fact.kind === 'build_completion' ? status.fact.completions : 0;
        return target <= 1 ? 'Marked done.' : `${completions} of ${target} logged.`;
      }
      case 'late_check_in': return 'Tracking ended without a check-in yet — there is still time to report it.';
      case 'missed': return 'No check-in was received before the deadline, so this period counts as not met.';
      case 'closed_satisfied': return 'This period met its target.';
      case 'closed_not_satisfied': return 'This period did not meet its target.';
      default: return '';
    }
  }
  if (direction === 'cut_back') {
    const maxTarget = period.target.type === 'maximum_value' ? period.target : null;
    const unit = maxTarget?.measurement.unit ?? '';
    const maximum = maxTarget?.maximum ?? 0;
    switch (status.kind) {
      case 'upcoming': return 'Not started yet.';
      case 'calm': return `Maximum ${maximum} ${unit} this ${period.periodKind === 'week' ? 'week' : 'period'} — report your total anytime.`;
      case 'check_in_due': return `Maximum ${maximum} ${unit} today.`;
      case 'reported':
      case 'late_reported': {
        const total = status.fact.kind === 'cut_back_total' ? status.fact.total : 0;
        return total <= maximum ? `${total} of ${maximum} ${unit} — within the limit.` : `${total} of ${maximum} ${unit} — over the limit.`;
      }
      case 'late_check_in': return 'Tracking ended without a total yet — there is still time to report it.';
      case 'missed': return 'No check-in was received before the deadline, so this period counts as not met.';
      case 'closed_satisfied': return 'This period stayed within the limit.';
      case 'closed_not_satisfied': return 'This period went over the limit.';
      default: return '';
    }
  }
  // stop
  switch (status.kind) {
    case 'upcoming': return 'Not started yet.';
    case 'calm': return 'No lapse on record. Keep going.';
    case 'stop_lapse_on_record': return 'A lapse is on record. You can correct it if it was reported by accident.';
    case 'stop_final_attestation_due': return 'Tracking has ended. Confirm whether you kept the promise for the full challenge.';
    case 'missed': return 'No final answer was received before the deadline, so this counts as not kept.';
    case 'closed_satisfied': return 'You confirmed the promise was kept for the full challenge.';
    case 'closed_not_satisfied': return 'A lapse on record means the promise was not kept.';
    default: return '';
  }
}

function progressSummary(
  challenge: ActivatedChallengeSnapshot,
  periods: readonly ChallengePeriod[],
  periodStates: ReadonlyMap<string, EffectivePeriodState>,
): ProgressSummary {
  const ordered = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);
  const closedOrdered = ordered.filter((p) => isClosedState(periodStates.get(p.id)!));
  const periodsMet = closedOrdered.filter((p) => periodStates.get(p.id)!.kind === 'satisfied').length;

  let streak = 0;
  for (let i = closedOrdered.length - 1; i >= 0; i -= 1) {
    if (periodStates.get(closedOrdered[i].id)!.kind !== 'satisfied') break;
    streak += 1;
  }
  const unitLabel = ordered[0]?.periodKind === 'week' ? 'week' : 'day';
  const streakLabel = streak >= 2 && ordered[0]?.periodKind !== 'continuous' ? `${streak}-${unitLabel} streak` : null;

  const rule = challenge.successRule;
  const aggregateLabel = rule.direction === 'build'
    ? `${rule.minimumRequiredCompletions} of ${rule.totalPlannedCompletions} total completions needed to succeed`
    : rule.direction === 'cut_back'
    ? `${rule.minimumPeriodsWithinLimit} of ${rule.totalPeriods} periods need to stay within the limit`
    : 'Zero lapses allowed for the full challenge.';

  return { periodsClosed: closedOrdered.length, periodsTotal: ordered.length, periodsMet, streakLabel, aggregateLabel };
}

function errorViewModel(challenge: ActivatedChallengeSnapshot, focusPeriodId: ChallengePeriodId): ActiveChallengeViewModel {
  return {
    direction: challenge.successRule.direction,
    goal: challenge.goal,
    promise: challenge.behavior.description,
    focusPeriodId,
    currentPeriodHeadline: 'Your challenge',
    currentPeriodStatus: { kind: 'error' },
    currentPeriodCopy: 'Something in this check-in history needs attention.',
    nextAction: { kind: 'none', label: '', detail: 'Something in this check-in history needs attention.' },
    consequenceSummary: '',
    timeRemaining: '',
    progress: { periodsClosed: 0, periodsTotal: 0, periodsMet: 0, streakLabel: null, aggregateLabel: '' },
    correction: { available: false },
    finalResult: null,
  };
}

export function buildActiveChallengeViewModel(input: ChallengeUxPreviewInput): ActiveChallengeViewModel {
  const { challenge, periods, events, now } = input;
  const focusPeriod = selectFocusPeriod(periods, now);

  const periodStates = new Map<string, EffectivePeriodState>();
  for (const period of periods) {
    const eventsForPeriod = events.filter((e) => e.periodId === period.id);
    const result = derivePeriodState(period, eventsForPeriod, now);
    if (!result.ok) return errorViewModel(challenge, focusPeriod.id);
    periodStates.set(period.id, result.state);
  }

  const focusState = periodStates.get(focusPeriod.id)!;
  const focusEvents = events.filter((e) => e.periodId === focusPeriod.id);
  const direction = challenge.successRule.direction;
  const { status, correction } = direction === 'stop'
    ? stopStatus(focusPeriod, focusEvents, focusState, now)
    : buildOrCutBackStatus(focusPeriod, focusEvents, focusState, now);

  const evaluation = evaluateChallenge({ challenge, periods, events, evaluatedAt: now });
  const finalResult = evaluation.evaluable ? { status: evaluation.status } : null;

  return {
    direction,
    goal: challenge.goal,
    promise: challenge.behavior.description,
    focusPeriodId: focusPeriod.id,
    currentPeriodHeadline: currentPeriodHeadline(focusPeriod),
    currentPeriodStatus: status,
    currentPeriodCopy: currentPeriodCopy(direction, focusPeriod, status),
    nextAction: nextActionFor(direction, status, focusPeriod, now),
    consequenceSummary: buildConsequenceSummary(challenge),
    timeRemaining: buildTimeRemaining(challenge, now, finalResult !== null),
    progress: progressSummary(challenge, periods, periodStates),
    correction,
    finalResult,
  };
}

function buildConsequenceSummary(challenge: ActivatedChallengeSnapshot): string {
  const recipientNames = challenge.recipients.map((r) => r.name.trim()).filter(Boolean).join(', ');
  const organizer = recipientNames || (challenge.rewardOrganizer.type === 'other' ? challenge.rewardOrganizer.name : 'your recipient');
  const amount = formatMoney(challenge.stake.minorUnits, challenge.stake.currency);
  return `If the promise isn't kept, ${amount} goes to ${organizer} instead of you.`;
}

function buildTimeRemaining(challenge: ActivatedChallengeSnapshot, now: IsoDateTime, isFinal: boolean): string {
  if (isFinal) return 'This challenge is complete.';
  const days = daysBetween(now, challenge.plannedEndsAt);
  if (days <= 0) return 'The tracking period has ended; final reporting is wrapping up.';
  if (days === 1) return '1 day left in this challenge.';
  return `${days} days left in this challenge.`;
}

// --- Shared helpers exported for the check-in / correction screens ---

export function describePeriodTarget(period: ChallengePeriod): string {
  if (period.target.type === 'completion_target') {
    return period.target.target <= 1 ? 'Once today' : `${period.target.target} times this ${period.periodKind === 'week' ? 'week' : 'period'}`;
  }
  if (period.target.type === 'maximum_value') {
    return `Maximum ${period.target.maximum} ${period.target.measurement.unit} this ${period.periodKind === 'week' ? 'week' : 'period'}`;
  }
  return 'Zero lapses for the full challenge';
}

export function describeFact(fact: CheckInFact): string {
  switch (fact.kind) {
    case 'build_completion': return `${fact.completions} logged`;
    case 'cut_back_total': return `${fact.total} ${fact.unit}`;
    case 'stop_intact': return 'Still going';
    case 'stop_lapse': return 'A lapse';
  }
}

export { formatClockTime, daysBetween };
