// The 21 named review states from docs/CHALLENGE_CHECKIN_UX.md / the task
// brief, each a self-contained, real domain input set (ActivatedChallengeSnapshot
// + generated periods + append-only events + a fixed fixture clock). The hub
// screen (app/challenge-ux-preview/index.tsx) lets a reviewer jump directly
// into any of these without replaying a challenge — every displayed status is
// still derived by the real check-in engine from this input, not hardcoded.

// Relative imports (not `@/`) — see the note in lib/challenge-ux-preview/view-model.ts.
import { ChallengePeriod } from '../../domain/challenge/periods';
import { CheckInEvent } from '../../domain/challenge/check-in/types';
import { ActivatedChallengeSnapshot, IsoDateTime, SuccessRuleSnapshot } from '../../domain/challenge/types';
import { buildChallenge, buildEvent, buildPeriod } from './builders';

export type ChallengeUxScenario = {
  readonly id: string;
  readonly menuLabel: string;
  readonly menuGroup: 'Build' | 'Cut back' | 'Stop' | 'Final';
  readonly landing: 'home' | 'check-in' | 'result';
  readonly challenge: ActivatedChallengeSnapshot;
  readonly periods: readonly ChallengePeriod[];
  readonly events: readonly CheckInEvent[];
  readonly now: IsoDateTime;
};

const iso = (s: string) => s as IsoDateTime;

// --- Shared success-rule snapshots ---

const DAILY_BUILD_RULE: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
  direction: 'build', ruleVersion: 1, totalPlannedCompletions: 14, minimumRequiredCompletions: 10,
  continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
};

const WEEKLY_BUILD_RULE: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
  direction: 'build', ruleVersion: 1, totalPlannedCompletions: 16, minimumRequiredCompletions: 12,
  continuitySafeguard: { type: 'maximum_consecutive_missed_weeks', maximum: 1 }, periodTarget: 4, periodUnit: 'week',
};

const CUT_BACK_RULE: Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> = {
  direction: 'cut_back', ruleVersion: 1, measurementType: 'count', maximumAllowedValue: 3,
  periodUnit: 'week', totalPeriods: 4, minimumPeriodsWithinLimit: 3,
  continuitySafeguard: { type: 'maximum_consecutive_exceeded_weeks', maximum: 1 },
};

const STOP_RULE: Extract<SuccessRuleSnapshot, { direction: 'stop' }> = { direction: 'stop', ruleVersion: 1, lapseRule: { type: 'zero_lapses' } };

// --- Build fixtures ---

function dailyBuildChallenge(): ActivatedChallengeSnapshot {
  return buildChallenge({
    goal: 'Feel stronger and more energized',
    behaviorDescription: 'Walk for 20 minutes',
    completionDefinition: 'A 20-minute walk, indoors or outside.',
    successRule: DAILY_BUILD_RULE,
    startsAt: iso('2026-08-03T00:00:00Z'),
    plannedEndsAt: iso('2026-08-17T00:00:00Z'),
  });
}

function weeklyBuildChallenge(): ActivatedChallengeSnapshot {
  return buildChallenge({
    goal: 'Build a consistent gym habit',
    behaviorDescription: 'Go to the gym',
    completionDefinition: 'One completed gym session of any length.',
    successRule: WEEKLY_BUILD_RULE,
    startsAt: iso('2026-08-03T00:00:00Z'),
    plannedEndsAt: iso('2026-08-31T00:00:00Z'),
  });
}

function dailyPeriod(startsAt: IsoDateTime, endsAt: IsoDateTime, reportingClosesAt: IsoDateTime): ChallengePeriod {
  return buildPeriod({ periodKind: 'day', startsAt, endsAt, reportingClosesAt, target: { type: 'completion_target', target: 1 } });
}

function weeklyBuildPeriod(startsAt: IsoDateTime, endsAt: IsoDateTime, reportingClosesAt: IsoDateTime): ChallengePeriod {
  return buildPeriod({ periodKind: 'week', startsAt, endsAt, reportingClosesAt, target: { type: 'completion_target', target: 4 } });
}

const buildActiveNothingDue: ChallengeUxScenario = (() => {
  const period = weeklyBuildPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  return {
    id: 'build-active-nothing-due', menuLabel: 'Build — active, nothing due yet', menuGroup: 'Build', landing: 'home',
    challenge: weeklyBuildChallenge(), periods: [period], events: [], now: iso('2026-08-05T15:00:00Z'),
  };
})();

const buildDailyDue: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-05T00:00:00Z'), iso('2026-08-06T00:00:00Z'), iso('2026-08-06T10:00:00Z'));
  return {
    id: 'build-daily-due', menuLabel: 'Build daily — check-in due', menuGroup: 'Build', landing: 'home',
    challenge: dailyBuildChallenge(), periods: [period], events: [], now: iso('2026-08-05T18:00:00Z'),
  };
})();

const buildDailyReportedDone: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-05T00:00:00Z'), iso('2026-08-06T00:00:00Z'), iso('2026-08-06T10:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 },
    clientRecordedAt: iso('2026-08-05T18:05:00Z'),
  });
  return {
    id: 'build-daily-reported-done', menuLabel: 'Build daily — reported Done', menuGroup: 'Build', landing: 'home',
    challenge: dailyBuildChallenge(), periods: [period], events: [event], now: iso('2026-08-05T19:00:00Z'),
  };
})();

const buildWeeklyReportTotal: ChallengeUxScenario = (() => {
  // Tracking has ended and reporting is open — a weekly count is only ever
  // solicited once, at period end, never as an evolving "so far" mid-week
  // total. See docs/CHALLENGE_CHECKIN_UX.md's "Reporting timing model".
  const period = weeklyBuildPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  return {
    id: 'build-weekly-report-total', menuLabel: 'Build weekly count — report total', menuGroup: 'Build', landing: 'check-in',
    challenge: weeklyBuildChallenge(), periods: [period], events: [], now: iso('2026-08-10T06:00:00Z'),
  };
})();

const buildLateReportingOpen: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-04T00:00:00Z'), iso('2026-08-05T00:00:00Z'), iso('2026-08-05T10:00:00Z'));
  return {
    id: 'build-late-reporting-open', menuLabel: 'Build — period ended, reporting still open', menuGroup: 'Build', landing: 'home',
    challenge: dailyBuildChallenge(), periods: [period], events: [], now: iso('2026-08-05T04:00:00Z'),
  };
})();

const buildMissedDeadline: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-04T00:00:00Z'), iso('2026-08-05T00:00:00Z'), iso('2026-08-05T10:00:00Z'));
  return {
    id: 'build-missed-deadline', menuLabel: 'Build — missed reporting deadline', menuGroup: 'Build', landing: 'home',
    challenge: dailyBuildChallenge(), periods: [period], events: [], now: iso('2026-08-05T11:00:00Z'),
  };
})();

const buildCorrectionAvailable: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-04T00:00:00Z'), iso('2026-08-05T00:00:00Z'), iso('2026-08-05T10:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 },
    clientRecordedAt: iso('2026-08-04T20:00:00Z'),
  });
  return {
    id: 'build-correction-available', menuLabel: 'Build — correction available', menuGroup: 'Build', landing: 'home',
    challenge: dailyBuildChallenge(), periods: [period], events: [event], now: iso('2026-08-05T05:00:00Z'),
  };
})();

const buildCorrectionClosed: ChallengeUxScenario = (() => {
  const period = dailyPeriod(iso('2026-08-04T00:00:00Z'), iso('2026-08-05T00:00:00Z'), iso('2026-08-05T10:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 },
    clientRecordedAt: iso('2026-08-04T20:00:00Z'),
  });
  return {
    id: 'build-correction-closed', menuLabel: 'Build — correction window closed', menuGroup: 'Build', landing: 'check-in',
    challenge: dailyBuildChallenge(), periods: [period], events: [event], now: iso('2026-08-05T11:00:00Z'),
  };
})();

// --- Cut back fixtures ---

function cutBackChallenge(): ActivatedChallengeSnapshot {
  return buildChallenge({
    goal: 'Spend less on takeaway',
    behaviorDescription: 'Limit takeaway meals',
    completionDefinition: 'Any meal ordered for delivery or takeaway.',
    successRule: CUT_BACK_RULE,
    startsAt: iso('2026-08-03T00:00:00Z'),
    plannedEndsAt: iso('2026-08-31T00:00:00Z'),
    cutBackUnit: 'meals',
  });
}

function cutBackPeriod(startsAt: IsoDateTime, endsAt: IsoDateTime, reportingClosesAt: IsoDateTime): ChallengePeriod {
  return buildPeriod({ periodKind: 'week', startsAt, endsAt, reportingClosesAt, target: { type: 'maximum_value', maximum: 3, measurement: { type: 'count', unit: 'meals' } } });
}

const cutBackActiveNothingDue: ChallengeUxScenario = (() => {
  const period = cutBackPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  return {
    id: 'cut-back-active-nothing-due', menuLabel: 'Cut back — active, nothing due yet', menuGroup: 'Cut back', landing: 'home',
    challenge: cutBackChallenge(), periods: [period], events: [], now: iso('2026-08-06T12:00:00Z'),
  };
})();

const cutBackReportTotal: ChallengeUxScenario = (() => {
  // Tracking has ended and reporting is open — see the note on
  // build-weekly-report-total above; the same locked rule applies to Cut
  // back regardless of cadence.
  const period = cutBackPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  return {
    id: 'cut-back-report-total', menuLabel: 'Cut back — report total', menuGroup: 'Cut back', landing: 'check-in',
    challenge: cutBackChallenge(), periods: [period], events: [], now: iso('2026-08-10T06:00:00Z'),
  };
})();

const cutBackWithinLimit: ChallengeUxScenario = (() => {
  const period = cutBackPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'meals' },
    clientRecordedAt: iso('2026-08-10T06:00:00Z'),
  });
  return {
    id: 'cut-back-within-limit', menuLabel: 'Cut back — within limit', menuGroup: 'Cut back', landing: 'home',
    challenge: cutBackChallenge(), periods: [period], events: [event], now: iso('2026-08-10T06:30:00Z'),
  };
})();

const cutBackOverLimit: ChallengeUxScenario = (() => {
  const period = cutBackPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 5, unit: 'meals' },
    clientRecordedAt: iso('2026-08-10T06:00:00Z'),
  });
  return {
    id: 'cut-back-over-limit', menuLabel: 'Cut back — over limit', menuGroup: 'Cut back', landing: 'home',
    challenge: cutBackChallenge(), periods: [period], events: [event], now: iso('2026-08-10T06:30:00Z'),
  };
})();

const cutBackCorrection: ChallengeUxScenario = (() => {
  const period = cutBackPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-10T00:00:00Z'), iso('2026-08-11T12:00:00Z'));
  const event = buildEvent({
    periodId: period.id, eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'meals' },
    clientRecordedAt: iso('2026-08-10T06:00:00Z'),
  });
  return {
    id: 'cut-back-correction', menuLabel: 'Cut back — correction', menuGroup: 'Cut back', landing: 'check-in',
    challenge: cutBackChallenge(), periods: [period], events: [event], now: iso('2026-08-10T06:30:00Z'),
  };
})();

// --- Stop fixtures ---

function stopChallenge(): ActivatedChallengeSnapshot {
  return buildChallenge({
    goal: 'Quit vaping for good',
    behaviorDescription: 'Stay smoke-free',
    completionDefinition: 'No vaping, at all, for the full challenge.',
    successRule: STOP_RULE,
    startsAt: iso('2026-08-03T00:00:00Z'),
    plannedEndsAt: iso('2026-08-17T00:00:00Z'),
  });
}

function stopPeriod(): ChallengePeriod {
  return buildPeriod({
    periodKind: 'continuous', startsAt: iso('2026-08-03T00:00:00Z'), endsAt: iso('2026-08-17T00:00:00Z'),
    reportingClosesAt: iso('2026-08-17T10:00:00Z'), target: { type: 'maximum_lapses', maximum: 0 },
  });
}

const stopActiveIntact: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  return {
    id: 'stop-active-intact', menuLabel: 'Stop — active/intact, no required daily action', menuGroup: 'Stop', landing: 'home',
    challenge: stopChallenge(), periods: [period], events: [], now: iso('2026-08-08T12:00:00Z'),
  };
})();

const stopLapseReporting: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  return {
    id: 'stop-lapse-reporting', menuLabel: 'Stop — lapse reporting', menuGroup: 'Stop', landing: 'check-in',
    challenge: stopChallenge(), periods: [period], events: [], now: iso('2026-08-08T12:00:00Z'),
  };
})();

const stopLapseRecorded: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  const lapse = buildEvent({ periodId: period.id, eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: iso('2026-08-08T09:00:00Z') });
  return {
    id: 'stop-lapse-recorded', menuLabel: 'Stop — lapse recorded', menuGroup: 'Stop', landing: 'home',
    challenge: stopChallenge(), periods: [period], events: [lapse], now: iso('2026-08-08T12:00:00Z'),
  };
})();

const stopAccidentalCorrection: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  const lapse = buildEvent({ periodId: period.id, eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: iso('2026-08-08T09:00:00Z') });
  return {
    id: 'stop-accidental-correction', menuLabel: 'Stop — accidental lapse correction', menuGroup: 'Stop', landing: 'check-in',
    challenge: stopChallenge(), periods: [period], events: [lapse], now: iso('2026-08-08T12:00:00Z'),
  };
})();

const stopCorrectedButAttestationRequired: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  const lapse = buildEvent({ periodId: period.id, eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: iso('2026-08-08T09:00:00Z') });
  const correction = buildEvent({
    periodId: period.id, eventType: 'correction', fact: { kind: 'stop_intact' }, correctionOfEventId: lapse.id,
    clientRecordedAt: iso('2026-08-08T09:05:00Z'),
  });
  return {
    id: 'stop-corrected-attestation-required', menuLabel: 'Stop — corrected lapse but final attestation still required', menuGroup: 'Stop', landing: 'home',
    challenge: stopChallenge(), periods: [period], events: [lapse, correction], now: iso('2026-08-17T05:00:00Z'),
  };
})();

const stopFinalAttestationDue: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  return {
    id: 'stop-final-attestation-due', menuLabel: 'Stop — final attestation due', menuGroup: 'Stop', landing: 'check-in',
    challenge: stopChallenge(), periods: [period], events: [], now: iso('2026-08-17T05:00:00Z'),
  };
})();

const stopFinalAttestationComplete: ChallengeUxScenario = (() => {
  const period = stopPeriod();
  const finalAttestation = buildEvent({
    periodId: period.id, eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: iso('2026-08-17T04:00:00Z'),
  });
  return {
    id: 'stop-final-attestation-complete', menuLabel: 'Stop — final attestation complete', menuGroup: 'Stop', landing: 'home',
    challenge: stopChallenge(), periods: [period], events: [finalAttestation], now: iso('2026-08-17T11:00:00Z'),
  };
})();

// --- Final challenge result fixtures (multi-period build challenge) ---

const FINAL_RULE: Extract<SuccessRuleSnapshot, { direction: 'build' }> = {
  direction: 'build', ruleVersion: 1, totalPlannedCompletions: 3, minimumRequiredCompletions: 2,
  continuitySafeguard: { type: 'maximum_consecutive_missed_days', maximum: 2 }, periodTarget: 1, periodUnit: 'day',
};

function finalChallenge(): ActivatedChallengeSnapshot {
  return buildChallenge({
    goal: 'Feel stronger and more energized',
    behaviorDescription: 'Walk for 20 minutes',
    completionDefinition: 'A 20-minute walk, indoors or outside.',
    successRule: FINAL_RULE,
    startsAt: iso('2026-08-03T00:00:00Z'),
    plannedEndsAt: iso('2026-08-06T00:00:00Z'),
  });
}

function finalPeriods(): readonly ChallengePeriod[] {
  return [
    dailyPeriod(iso('2026-08-03T00:00:00Z'), iso('2026-08-04T00:00:00Z'), iso('2026-08-04T10:00:00Z')),
    dailyPeriod(iso('2026-08-04T00:00:00Z'), iso('2026-08-05T00:00:00Z'), iso('2026-08-05T10:00:00Z')),
    dailyPeriod(iso('2026-08-05T00:00:00Z'), iso('2026-08-06T00:00:00Z'), iso('2026-08-06T10:00:00Z')),
  ];
}

const finalSuccess: ChallengeUxScenario = (() => {
  const periods = finalPeriods();
  const [p1, , p3] = periods;
  const events = [
    buildEvent({ periodId: p1.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, clientRecordedAt: iso('2026-08-03T18:00:00Z') }),
    buildEvent({ periodId: p3.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, clientRecordedAt: iso('2026-08-05T18:00:00Z') }),
  ];
  return {
    id: 'final-success', menuLabel: 'Final challenge success', menuGroup: 'Final', landing: 'result',
    challenge: finalChallenge(), periods, events, now: iso('2026-08-06T12:00:00Z'),
  };
})();

const finalFailure: ChallengeUxScenario = (() => {
  const periods = finalPeriods();
  const [, , p3] = periods;
  const events = [
    buildEvent({ periodId: p3.id, eventType: 'build_completion', fact: { kind: 'build_completion', completions: 1 }, clientRecordedAt: iso('2026-08-05T18:00:00Z') }),
  ];
  return {
    id: 'final-failure', menuLabel: 'Final challenge failure', menuGroup: 'Final', landing: 'result',
    challenge: finalChallenge(), periods, events, now: iso('2026-08-06T12:00:00Z'),
  };
})();

export const CHALLENGE_UX_SCENARIOS: readonly ChallengeUxScenario[] = [
  buildActiveNothingDue,
  buildDailyDue,
  buildDailyReportedDone,
  buildWeeklyReportTotal,
  buildLateReportingOpen,
  buildMissedDeadline,
  buildCorrectionAvailable,
  buildCorrectionClosed,
  cutBackActiveNothingDue,
  cutBackReportTotal,
  cutBackWithinLimit,
  cutBackOverLimit,
  cutBackCorrection,
  stopActiveIntact,
  stopLapseReporting,
  stopLapseRecorded,
  stopAccidentalCorrection,
  stopCorrectedButAttestationRequired,
  stopFinalAttestationDue,
  stopFinalAttestationComplete,
  finalSuccess,
  finalFailure,
];

export function findScenario(id: string): ChallengeUxScenario {
  const found = CHALLENGE_UX_SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown challenge UX preview scenario: ${id}`);
  return found;
}
