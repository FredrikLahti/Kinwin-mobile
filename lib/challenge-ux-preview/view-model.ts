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
  /** Empty string when it would only restate `currentPeriodCopy` — see docs/CHALLENGE_CHECKIN_UX.md's "Duplicated status copy" note. Never blanked out when it carries the reporting deadline. */
  readonly detail: string;
};

export type ProgressSummary = {
  readonly periodsClosed: number;
  readonly periodsTotal: number;
  readonly periodsMet: number;
  readonly streakLabel: string | null;
  /** Factual progress so far, derived from real effective facts/period states. Null when there is genuinely nothing to report yet (e.g. no period has closed). Always null for Stop, where "progress" would just restate `currentPeriodCopy`. */
  readonly progressSoFarLabel: string | null;
  /** The success rule's own threshold, restated — never computed here. */
  readonly requirementLabel: string;
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
  /**
   * Stop-only: the specific, currently-effective `stop_lapse` entry an
   * "accidental lapse" correction should target — deterministically the most
   * recently recorded uncorrected lapse, never a blind `correction.targets[0]`
   * (which could be a non-lapse chain when Stop's history has several
   * simultaneously-live chains). Null whenever no uncorrected lapse exists,
   * or for non-Stop directions. A richer "pick which of several lapses to
   * correct" UI is future work, not built here.
   */
  readonly stopLapseCorrectionTarget: CorrectionTarget | null;
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

function describeExperienceCategory(category: ActivatedChallengeSnapshot['consequenceCategory']): string {
  switch (category) {
    case 'dinner': return 'dinner';
    case 'adventure': return 'adventure';
    case 'culture': return 'cultural outing';
    case 'getaway': return 'getaway';
    case 'wellness': return 'wellness day';
  }
}

/** A period target shaped as a simple, single binary daily promise (e.g. "Walk for 20 minutes") — the one case where a due/not-yet prompt during tracking makes sense at all. */
function isBinaryDailyTarget(period: ChallengePeriod): boolean {
  return period.target.type === 'completion_target' && period.target.target <= 1;
}

/** True when this period's report is only ever expected once, at period end — never "due" partway through tracking (weekly Build counts, and Cut back of any cadence). Distinguishes "the normal, expected report moment" from a genuinely late daily Build check-in for copy purposes. */
function isRoutineEndOfPeriodReport(direction: ActivatedChallengeSnapshot['successRule']['direction'], period: ChallengePeriod): boolean {
  if (direction === 'cut_back') return true;
  if (direction === 'build') return !isBinaryDailyTarget(period);
  return false;
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
  direction: ActivatedChallengeSnapshot['successRule']['direction'],
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
        // Locked UX rule: a declared-value period report (weekly Build count,
        // any Cut back cadence) is never solicited mid-tracking — only a
        // simple binary daily Build promise gets a due/not-yet prompt before
        // tracking ends. See docs/CHALLENGE_CHECKIN_UX.md's "Reporting
        // timing model".
        const dueNow = direction === 'build' && isBinaryDailyTarget(period);
        return { status: dueNow ? { kind: 'check_in_due' } : { kind: 'calm' }, correction: NO_CORRECTION };
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
): { status: CurrentPeriodStatus; correction: CorrectionAvailability; lapseCorrectionTarget: CorrectionTarget | null } {
  const NO_CORRECTION: CorrectionAvailability = { available: false };
  if (state.kind === 'upcoming') return { status: { kind: 'upcoming' }, correction: NO_CORRECTION, lapseCorrectionTarget: null };
  if (state.kind === 'closed_without_input') return { status: { kind: 'missed' }, correction: NO_CORRECTION, lapseCorrectionTarget: null };
  if (state.kind === 'satisfied') return { status: { kind: 'closed_satisfied', fact: state.fact }, correction: NO_CORRECTION, lapseCorrectionTarget: null };
  if (state.kind === 'not_satisfied') return { status: { kind: 'closed_not_satisfied', fact: state.fact }, correction: NO_CORRECTION, lapseCorrectionTarget: null };

  // state.kind === 'open': the sticky-lapse and final-attestation-window
  // rules only exist in `resolveStopHistory` (`derivePeriodState`'s single
  // rolled-up `open`/fact isn't rich enough for the UI's distinct "lapse on
  // record" vs "final attestation still due" states), so this is called
  // directly here — same engine, not a second one.
  const history = resolveStopHistory(period, eventsForPeriod);
  if (!history.ok) return { status: { kind: 'error' }, correction: NO_CORRECTION, lapseCorrectionTarget: null };

  const targets: CorrectionTarget[] = [...history.validCorrectionTargets].map((eventId) => {
    const ev = eventsForPeriod.find((e) => e.id === eventId);
    return { eventId, fact: ev ? ev.fact : { kind: 'stop_intact' as const } };
  });
  const correction: CorrectionAvailability = targets.length > 0 ? { available: true, targets } : NO_CORRECTION;

  // The "accidental lapse" correction must target an entry whose CURRENT
  // effective fact is actually `stop_lapse` — never just the first valid
  // correction target, which could belong to an unrelated intact chain.
  // Deterministic choice: the most recently recorded, still-effective lapse.
  const lapseCandidates = eventsForPeriod
    .filter((e) => history.validCorrectionTargets.has(e.id) && e.fact.kind === 'stop_lapse')
    .sort((a, b) => compareIso(b.serverRecordedAt ?? b.clientRecordedAt, a.serverRecordedAt ?? a.clientRecordedAt));
  const lapseCorrectionTarget: CorrectionTarget | null = lapseCandidates[0]
    ? { eventId: lapseCandidates[0].id, fact: lapseCandidates[0].fact }
    : null;

  if (history.hasUncorrectedLapse) return { status: { kind: 'stop_lapse_on_record' }, correction, lapseCorrectionTarget };
  const trackingEnded = compareIso(now, period.endsAt) >= 0;
  if (trackingEnded) return { status: { kind: 'stop_final_attestation_due' }, correction, lapseCorrectionTarget };
  return { status: { kind: 'calm' }, correction, lapseCorrectionTarget };
}

function nextActionFor(
  direction: ActivatedChallengeSnapshot['successRule']['direction'],
  status: CurrentPeriodStatus,
  period: ChallengePeriod,
): NextAction {
  const deadline = formatClockTime(period.reportingClosesAt);
  switch (status.kind) {
    case 'upcoming':
      return { kind: 'none', label: '', detail: '' };
    case 'calm':
      return { kind: 'none', label: '', detail: '' };
    case 'check_in_due':
      return {
        kind: 'check_in',
        label: direction === 'cut_back' ? 'Log today' : 'Check in',
        detail: 'A quick check-in keeps your promise on record.',
      };
    case 'reported':
      return { kind: 'none', label: '', detail: '' };
    case 'late_check_in': {
      const routine = isRoutineEndOfPeriodReport(direction, period);
      return {
        kind: 'late_check_in',
        label: routine ? 'Report total' : 'Check in now',
        detail: routine
          ? `${period.periodKind === 'week' ? 'This week' : 'This period'} has ended. You can report your total until ${deadline}.`
          : `Yesterday is complete. You can still check in until ${deadline}.`,
      };
    }
    case 'late_reported':
      return { kind: 'none', label: '', detail: `You can still correct it until ${deadline}.` };
    case 'missed':
      return { kind: 'none', label: '', detail: '' };
    case 'closed_satisfied':
      return { kind: 'none', label: '', detail: '' };
    case 'closed_not_satisfied':
      return { kind: 'none', label: '', detail: '' };
    case 'stop_lapse_on_record':
      return { kind: 'none', label: '', detail: '' };
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
  const periodWord = period.periodKind === 'week' ? 'week' : 'period';
  if (direction === 'build') {
    const target = period.target.type === 'completion_target' ? period.target.target : 0;
    switch (status.kind) {
      case 'upcoming': return 'Not started yet.';
      case 'calm': return `Nothing to report yet this ${periodWord}.`;
      case 'check_in_due': return 'Not logged yet today.';
      case 'reported':
      case 'late_reported': {
        const completions = status.fact.kind === 'build_completion' ? status.fact.completions : 0;
        return target <= 1 ? 'Marked done.' : `${completions} of ${target} logged.`;
      }
      case 'late_check_in':
        return target <= 1
          ? 'Tracking ended without a check-in yet.'
          : `Time to report how many times this ${periodWord}.`;
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
      case 'calm': return `Maximum ${maximum} ${unit} this ${periodWord}.`;
      case 'check_in_due': return `Maximum ${maximum} ${unit} today.`;
      case 'reported':
      case 'late_reported': {
        const total = status.fact.kind === 'cut_back_total' ? status.fact.total : 0;
        return total <= maximum ? `${total} of ${maximum} ${unit} — within the limit.` : `${total} of ${maximum} ${unit} — over the limit.`;
      }
      case 'late_check_in': return `Time to report how many ${unit} this ${periodWord}.`;
      case 'missed': return 'No check-in was received before the deadline, so this period counts as not met.';
      case 'closed_satisfied': return 'This period stayed within the limit.';
      case 'closed_not_satisfied': return 'This period went over the limit.';
      default: return '';
    }
  }
  // stop
  switch (status.kind) {
    case 'upcoming': return 'Not started yet.';
    case 'calm': return 'No check-in needed right now.';
    case 'stop_lapse_on_record': return 'A lapse is on record.';
    case 'stop_final_attestation_due': return 'Tracking has ended. Confirm whether you kept the promise for the full challenge.';
    case 'missed': return 'No final answer was received before the deadline, so this counts as not kept.';
    case 'closed_satisfied': return 'You confirmed the promise was kept for the full challenge.';
    case 'closed_not_satisfied': return 'A lapse on record means the promise was not kept.';
    default: return '';
  }
}

/** Mirrors `evaluateBuild`'s per-period capping (docs/CHECK_IN_ENGINE.md's "declared values, not deltas") for DISPLAY only — this never decides success; only `evaluateChallenge` does that. */
function buildCreditedCompletions(periods: readonly ChallengePeriod[], periodStates: ReadonlyMap<string, EffectivePeriodState>): number {
  let total = 0;
  for (const period of periods) {
    const state = periodStates.get(period.id);
    if (!state || (state.kind !== 'satisfied' && state.kind !== 'not_satisfied')) continue;
    if (state.fact.kind !== 'build_completion' || period.target.type !== 'completion_target') continue;
    total += Math.min(state.fact.completions, period.target.target);
  }
  return total;
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
  let progressSoFarLabel: string | null;
  let requirementLabel: string;
  if (rule.direction === 'build') {
    const credited = buildCreditedCompletions(ordered, periodStates);
    progressSoFarLabel = `${credited} completion${credited === 1 ? '' : 's'} count so far.`;
    requirementLabel = `Need ${rule.minimumRequiredCompletions} of ${rule.totalPlannedCompletions} to pass.`;
  } else if (rule.direction === 'cut_back') {
    progressSoFarLabel = closedOrdered.length === 0
      ? null
      : `${periodsMet} of ${closedOrdered.length} closed period${closedOrdered.length === 1 ? '' : 's'} stayed within the limit.`;
    requirementLabel = `Need ${rule.minimumPeriodsWithinLimit} of ${rule.totalPeriods} to pass.`;
  } else {
    progressSoFarLabel = null;
    requirementLabel = 'Zero lapses allowed for the full challenge.';
  }

  return { periodsClosed: closedOrdered.length, periodsTotal: ordered.length, periodsMet, streakLabel, progressSoFarLabel, requirementLabel };
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
    progress: { periodsClosed: 0, periodsTotal: 0, periodsMet: 0, streakLabel: null, progressSoFarLabel: null, requirementLabel: '' },
    correction: { available: false },
    stopLapseCorrectionTarget: null,
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
  const { status, correction, lapseCorrectionTarget: stopLapseCorrectionTarget } = direction === 'stop'
    ? stopStatus(focusPeriod, focusEvents, focusState, now)
    : { ...buildOrCutBackStatus(direction, focusPeriod, focusEvents, focusState, now), lapseCorrectionTarget: null };

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
    nextAction: nextActionFor(direction, status, focusPeriod),
    consequenceSummary: buildConsequenceSummary(challenge),
    timeRemaining: buildTimeRemaining(challenge, now, finalResult !== null),
    progress: progressSummary(challenge, periods, periodStates),
    correction,
    stopLapseCorrectionTarget,
    finalResult,
  };
}

function buildConsequenceSummary(challenge: ActivatedChallengeSnapshot): string {
  const recipientNames = challenge.recipients.map((r) => r.name.trim()).filter(Boolean).join(', ');
  const organizer = recipientNames || (challenge.rewardOrganizer.type === 'other' ? challenge.rewardOrganizer.name : 'your recipient');
  const amount = formatMoney(challenge.stake.minorUnits, challenge.stake.currency);
  const category = describeExperienceCategory(challenge.consequenceCategory);
  return `If you don't keep the promise, ${amount} goes toward ${organizer}'s ${category} — and you sit it out.`;
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

export { formatClockTime, daysBetween, isBinaryDailyTarget, isRoutineEndOfPeriodReport };
