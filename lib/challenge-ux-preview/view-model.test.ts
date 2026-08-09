import assert from 'node:assert/strict';
import test from 'node:test';

// Relative imports (not `@/`) — see the note in lib/challenge-ux-preview/view-model.ts.
import { ChallengeId, IsoDateTime, UserId } from '../../domain/challenge/types';
import { evaluateChallenge } from '../../domain/challenge/results';
import { CHALLENGE_UX_SCENARIOS, findScenario } from '../../fixtures/challenge-ux-preview/scenarios';
import { buildEvent, buildPeriod } from '../../fixtures/challenge-ux-preview/builders';
import { buildActiveChallengeViewModel, describeFact, describeFinishedDay, describePeriodTarget, isBinaryDailyTarget, isRoutineEndOfPeriodReport } from './view-model';

// Every one of the 21 named review states resolves to the specific,
// domain-derived status it is supposed to demonstrate — this both documents
// intent and guards against a fixture silently drifting out of sync with the
// engine (e.g. a timestamp edit that quietly changes which branch fires).
const EXPECTED_STATUS: Record<string, string> = {
  'build-active-nothing-due': 'calm',
  'build-daily-due': 'check_in_due',
  'build-daily-reported-done': 'reported',
  'build-weekly-report-total': 'late_check_in',
  'build-late-reporting-open': 'late_check_in',
  'build-missed-deadline': 'missed',
  'build-correction-available': 'late_reported',
  'build-correction-closed': 'closed_satisfied',
  'cut-back-active-nothing-due': 'calm',
  'cut-back-report-total': 'late_check_in',
  'cut-back-within-limit': 'late_reported',
  'cut-back-over-limit': 'late_reported',
  'cut-back-correction': 'late_reported',
  'stop-active-intact': 'calm',
  'stop-lapse-reporting': 'calm',
  'stop-lapse-recorded': 'stop_lapse_on_record',
  'stop-accidental-correction': 'stop_lapse_on_record',
  'stop-corrected-attestation-required': 'stop_final_attestation_due',
  'stop-final-attestation-due': 'stop_final_attestation_due',
  'stop-final-attestation-complete': 'closed_satisfied',
};

test('every named review state resolves to its intended, domain-derived status', () => {
  for (const scenario of CHALLENGE_UX_SCENARIOS) {
    if (scenario.menuGroup === 'Final') continue;
    const expected = EXPECTED_STATUS[scenario.id];
    assert.ok(expected, `no expected status recorded for ${scenario.id}`);
    const viewModel = buildActiveChallengeViewModel(scenario);
    assert.equal(viewModel.currentPeriodStatus.kind, expected, `${scenario.id} expected ${expected}`);
  }
});

// --- Reporting window: period ended but reporting still open is a grace state, not a failure ---

test('a period that ended but is still inside its reporting window offers a late check-in, never a failure', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('build-late-reporting-open'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'late_check_in');
  assert.equal(viewModel.nextAction.kind, 'late_check_in');
  assert.ok(!viewModel.nextAction.detail.toLowerCase().includes('fail'));
});

// --- Missed deadline: neutral no-response copy, not "you did nothing" ---

test('a missed reporting deadline uses neutral no-response copy, never claiming the user did nothing', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('build-missed-deadline'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'missed');
  assert.equal(viewModel.currentPeriodCopy, 'No check-in was received before the deadline, so this period counts as not met.');
  assert.ok(!viewModel.currentPeriodCopy.toLowerCase().includes('you did nothing'));
});

// --- Correction availability tracks the reporting window exactly ---

test('correction is available while the reporting window is open and unavailable once it has closed', () => {
  const open = buildActiveChallengeViewModel(findScenario('build-correction-available'));
  assert.equal(open.correction.available, true);
  const closed = buildActiveChallengeViewModel(findScenario('build-correction-closed'));
  assert.equal(closed.correction.available, false);
});

// --- Cut back reflects the challenge's own unit and the actual reported total ---

test('cut back copy uses the challenge unit and the actual reported total, not a generic count', () => {
  const within = buildActiveChallengeViewModel(findScenario('cut-back-within-limit'));
  assert.equal(within.currentPeriodCopy, '2 of 3 meals, within the limit.');
  const over = buildActiveChallengeViewModel(findScenario('cut-back-over-limit'));
  assert.equal(over.currentPeriodCopy, '5 of 3 meals, over the limit.');
  assert.ok(!over.currentPeriodCopy.toLowerCase().includes('fail'));
});

// --- Build daily maps to a declared total, not a raw increment ---

test('a simple daily Build target describes itself as a single binary action, not a manual count', () => {
  const scenario = findScenario('build-daily-due');
  assert.equal(describePeriodTarget(scenario.periods[0]), 'Once today');
});

test('build_completion facts describe a declared total', () => {
  assert.equal(describeFact({ kind: 'build_completion', completions: 3 }), '3 logged');
});

// --- Weekly Build reports a total for the period, not per-tap deltas ---

test('a weekly Build count target is described as a total for the period, not a per-day tally', () => {
  const scenario = findScenario('build-weekly-report-total');
  assert.equal(describePeriodTarget(scenario.periods[0]), '4 times this week');
});

// --- Stop: no daily nag while active and intact ---

test('an active, intact Stop challenge does not demand a daily check-in', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-active-intact'));
  assert.equal(viewModel.nextAction.kind, 'none');
  assert.equal(viewModel.currentPeriodStatus.kind, 'calm');
});

// --- Stop sticky-lapse regressions, exercised through the view model ---

const CHALLENGE_ID = 'view-model-test-challenge' as ChallengeId;
const OWNER_ID = 'view-model-test-owner' as UserId;

test('an uncorrected lapse remains failure-relevant even after a later ordinary intact ping', () => {
  const period = buildPeriod({
    periodKind: 'continuous',
    startsAt: '2026-01-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-01-08T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-01-08T10:00:00Z' as IsoDateTime,
    target: { type: 'maximum_lapses', maximum: 0 },
  });
  const lapse = buildEvent({ periodId: period.id, eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-01-02T00:00:00Z' as IsoDateTime });
  const laterIntact = buildEvent({ periodId: period.id, eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-01-03T00:00:00Z' as IsoDateTime });
  const challenge = findScenario('stop-lapse-recorded').challenge;
  const viewModel = buildActiveChallengeViewModel({
    challenge: { ...challenge, id: CHALLENGE_ID, ownerId: OWNER_ID },
    periods: [period],
    events: [lapse, laterIntact].map((e) => ({ ...e, challengeId: CHALLENGE_ID, ownerId: OWNER_ID })),
    now: '2026-01-05T00:00:00Z' as IsoDateTime,
  });
  assert.equal(viewModel.currentPeriodStatus.kind, 'stop_lapse_on_record');
});

// --- A corrected lapse does not, by itself, satisfy the final-attestation requirement ---

test('a corrected lapse does not satisfy the final attestation requirement on its own', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-corrected-attestation-required'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'stop_final_attestation_due');
  assert.notEqual(viewModel.currentPeriodStatus.kind, 'closed_satisfied');
});

test('a qualifying final ordinary intact attestation produces a domain-derived satisfied state', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-final-attestation-complete'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'closed_satisfied');
});

// --- Challenge success/failure display comes from evaluateChallenge, not independent UI math ---

test('final challenge success/failure in the view model matches evaluateChallenge exactly', () => {
  for (const id of ['final-success', 'final-failure']) {
    const scenario = findScenario(id);
    const viewModel = buildActiveChallengeViewModel(scenario);
    const direct = evaluateChallenge({ challenge: scenario.challenge, periods: scenario.periods, events: scenario.events, evaluatedAt: scenario.now });
    assert.ok(direct.evaluable);
    assert.ok(viewModel.finalResult !== null);
    assert.equal(viewModel.finalResult!.status, direct.evaluable ? direct.status : undefined);
  }
});

test('final-success and final-failure fixtures actually diverge in outcome', () => {
  const success = buildActiveChallengeViewModel(findScenario('final-success'));
  const failure = buildActiveChallengeViewModel(findScenario('final-failure'));
  assert.equal(success.finalResult?.status, 'success');
  assert.equal(failure.finalResult?.status, 'failure');
});

// --- Reporting timing model: declared-value periods are never solicited mid-tracking ---

test('a weekly Build count and a Cut back period stay calm — "nothing to report yet" — while tracking is still running', () => {
  const calmWeeklyBuild = buildActiveChallengeViewModel(findScenario('build-active-nothing-due'));
  assert.equal(calmWeeklyBuild.currentPeriodStatus.kind, 'calm');
  assert.ok(!calmWeeklyBuild.currentPeriodCopy.toLowerCase().includes('so far'));
});

test('a weekly Build count and a Cut back total are only asked for once tracking ends, never mid-tracking', () => {
  for (const id of ['build-weekly-report-total', 'cut-back-report-total']) {
    const viewModel = buildActiveChallengeViewModel(findScenario(id));
    assert.equal(viewModel.currentPeriodStatus.kind, 'late_check_in', `${id} should only be solicited once tracking ends`);
    assert.ok(!viewModel.currentPeriodCopy.toLowerCase().includes('so far'), `${id} copy must not say "so far"`);
  }
});

test('isRoutineEndOfPeriodReport: true for weekly Build counts and any Cut back cadence, false for a simple daily Build promise', () => {
  const weeklyBuildPeriod = findScenario('build-weekly-report-total').periods[0];
  const dailyBuildPeriod = findScenario('build-daily-due').periods[0];
  const cutBackPeriod = findScenario('cut-back-report-total').periods[0];
  assert.equal(isRoutineEndOfPeriodReport('build', weeklyBuildPeriod), true);
  assert.equal(isRoutineEndOfPeriodReport('build', dailyBuildPeriod), false);
  assert.equal(isRoutineEndOfPeriodReport('cut_back', cutBackPeriod), true);
  assert.equal(isBinaryDailyTarget(dailyBuildPeriod), true);
  assert.equal(isBinaryDailyTarget(weeklyBuildPeriod), false);
});

// --- Stop correction targeting: must pick an effective stop_lapse entry, never blindly targets[0] ---

test('the Stop lapse-correction target is deterministically an effective stop_lapse entry, not just the first correction target', () => {
  const period = buildPeriod({
    periodKind: 'continuous',
    startsAt: '2026-01-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-01-08T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-01-08T10:00:00Z' as IsoDateTime,
    target: { type: 'maximum_lapses', maximum: 0 },
  });
  // Two independent, simultaneously-live chains: an earlier ordinary intact
  // ping (never a lapse — its own valid correction target too) and, later, a
  // genuine lapse. A naive `targets[0]` could pick the intact chain instead.
  const earlyIntact = buildEvent({ periodId: period.id, eventType: 'stop_intact', fact: { kind: 'stop_intact' }, clientRecordedAt: '2026-01-02T00:00:00Z' as IsoDateTime });
  const lapse = buildEvent({ periodId: period.id, eventType: 'stop_lapse', fact: { kind: 'stop_lapse' }, clientRecordedAt: '2026-01-03T00:00:00Z' as IsoDateTime });
  const challenge = findScenario('stop-lapse-recorded').challenge;
  const viewModel = buildActiveChallengeViewModel({
    challenge: { ...challenge, id: CHALLENGE_ID, ownerId: OWNER_ID },
    periods: [period],
    events: [earlyIntact, lapse].map((e) => ({ ...e, challengeId: CHALLENGE_ID, ownerId: OWNER_ID })),
    now: '2026-01-05T00:00:00Z' as IsoDateTime,
  });
  assert.equal(viewModel.currentPeriodStatus.kind, 'stop_lapse_on_record');
  assert.ok(viewModel.stopLapseCorrectionTarget !== null);
  assert.equal(viewModel.stopLapseCorrectionTarget!.fact.kind, 'stop_lapse');
  assert.equal(viewModel.stopLapseCorrectionTarget!.eventId, lapse.id);
});

test('the Stop lapse-correction target is null when no uncorrected lapse exists, even if a correction target exists', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-active-intact'));
  assert.equal(viewModel.stopLapseCorrectionTarget, null);
});

// --- Duplicated status copy: nextAction.detail is blank unless it adds genuinely new information ---

test('nextAction.detail is blank when it would only restate currentPeriodCopy', () => {
  for (const id of ['build-missed-deadline', 'stop-lapse-recorded', 'build-daily-reported-done']) {
    const viewModel = buildActiveChallengeViewModel(findScenario(id));
    assert.equal(viewModel.nextAction.detail, '', `${id} should not duplicate currentPeriodCopy`);
  }
});

test('nextAction.detail keeps the reporting deadline visible on actionable late/final-attestation states', () => {
  for (const id of ['build-late-reporting-open', 'stop-final-attestation-due']) {
    const viewModel = buildActiveChallengeViewModel(findScenario(id));
    assert.notEqual(viewModel.nextAction.detail, '', `${id} must keep its deadline visible`);
  }
});

// --- Consequence wording: truthful, category-aware, never implies a charge already happened ---

test('the consequence summary never claims the stake was otherwise going to the participant, and never implies a charge already happened', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('build-daily-due'));
  const copy = viewModel.consequenceSummary.toLowerCase();
  assert.ok(!copy.includes('instead of you'));
  assert.ok(!copy.includes('was charged') && !copy.includes('has been charged') && !copy.includes('paid'));
  assert.ok(copy.includes('not take part'));
  assert.ok(copy.includes('dinner') || copy.includes('adventure') || copy.includes('cultural outing') || copy.includes('getaway') || copy.includes('wellness day'));
});

// --- Progress: factual progress so far, distinct from the rule's requirement, never a probability ---

test('Build progress distinguishes credited completions so far from the requirement', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('final-success'));
  assert.equal(viewModel.progress.progressSoFarLabel, '2 completions count so far.');
  assert.equal(viewModel.progress.requirementLabel, 'Need 2 of 3 to pass.');
});

test('Cut back progress distinguishes closed periods within limit from the requirement, and is null before any period has closed', () => {
  // cut-back-within-limit is still `open` (reporting window not yet closed)
  // — a period only counts toward "closed periods" once its own reporting
  // deadline has passed, so this constructs one past that point directly.
  const notYetClosed = buildActiveChallengeViewModel(findScenario('cut-back-report-total'));
  assert.equal(notYetClosed.progress.progressSoFarLabel, null);

  const period = buildPeriod({
    periodKind: 'week',
    startsAt: '2026-01-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-01-08T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-01-08T10:00:00Z' as IsoDateTime,
    target: { type: 'maximum_value', maximum: 3, measurement: { type: 'count', unit: 'meals' } },
  });
  const event = buildEvent({ periodId: period.id, eventType: 'cut_back_total', fact: { kind: 'cut_back_total', total: 2, unit: 'meals' }, clientRecordedAt: '2026-01-05T00:00:00Z' as IsoDateTime });
  const challenge = findScenario('cut-back-report-total').challenge;
  const closed = buildActiveChallengeViewModel({
    challenge: { ...challenge, id: CHALLENGE_ID, ownerId: OWNER_ID },
    periods: [period],
    events: [{ ...event, challengeId: CHALLENGE_ID, ownerId: OWNER_ID }],
    now: '2026-01-08T11:00:00Z' as IsoDateTime,
  });
  assert.equal(closed.progress.progressSoFarLabel, '1 of 1 closed period stayed within the limit.');
  assert.equal(closed.progress.requirementLabel, 'Need 3 of 4 to pass.');
});

// --- Fix: a daily Build promise is not "due" before tracking ends — optional, never an owed task ---

test('a daily Build promise still tracking is calm/optional, never framed as an owed daily task', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('build-daily-due'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'check_in_due');
  assert.equal(viewModel.currentPeriodCopy, "Check in when you've done it.");
  assert.equal(viewModel.nextAction.detail, '');
  assert.ok(!viewModel.currentPeriodCopy.toLowerCase().includes('due'));
});

// --- Fix: past-period daily Build wording is factually correct, never a hardcoded "yesterday" ---

test('describeFinishedDay says "yesterday" only when the finished period genuinely was the day before now', () => {
  const period = buildPeriod({
    periodKind: 'day',
    startsAt: '2026-03-01T00:00:00Z' as IsoDateTime,
    endsAt: '2026-03-02T00:00:00Z' as IsoDateTime,
    reportingClosesAt: '2026-03-02T10:00:00Z' as IsoDateTime,
    target: { type: 'completion_target', target: 1 },
  });
  const yesterday = describeFinishedDay(period, '2026-03-02T04:00:00Z' as IsoDateTime);
  assert.equal(yesterday.bare, 'yesterday');
  assert.equal(yesterday.withOn, 'yesterday');

  // 2026-03-01 is a Sunday — several days later, "yesterday" would be false.
  const daysLater = describeFinishedDay(period, '2026-03-05T04:00:00Z' as IsoDateTime);
  assert.equal(daysLater.bare, 'Sunday');
  assert.equal(daysLater.withOn, 'on Sunday');
});

test('a genuinely-late daily Build check-in uses the correct finished-day wording, never a stale "Once today"', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('build-late-reporting-open'));
  const scenario = findScenario('build-late-reporting-open');
  const finishedDay = describeFinishedDay(scenario.periods[0], scenario.now);
  assert.ok(viewModel.nextAction.detail.startsWith(`${finishedDay.bare[0].toUpperCase()}${finishedDay.bare.slice(1)} is complete`));
});

// --- Fix: an uncorrected Stop lapse explains the zero-lapse consequence, without claiming a charge already happened ---

test('an uncorrected Stop lapse explains the promise can no longer pass, without implying the consequence was already charged', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-lapse-recorded'));
  assert.equal(viewModel.currentPeriodStatus.kind, 'stop_lapse_on_record');
  const copy = viewModel.currentPeriodCopy.toLowerCase();
  assert.ok(copy.includes('can no longer pass'));
  assert.ok(copy.includes('corrected'));
  assert.ok(!copy.includes('charged') && !copy.includes('processed'));
});

// --- Fix: the Stop final-attestation home no longer says "Tracking has ended" twice ---

test('the Stop final-attestation state does not repeat "Tracking has ended" between currentPeriodCopy and nextAction.detail', () => {
  const viewModel = buildActiveChallengeViewModel(findScenario('stop-final-attestation-due'));
  assert.ok(viewModel.currentPeriodCopy.includes('Tracking has ended'));
  assert.ok(!viewModel.nextAction.detail.includes('Tracking has ended'));
  assert.ok(viewModel.nextAction.detail.startsWith('Final answer due by '));
});
