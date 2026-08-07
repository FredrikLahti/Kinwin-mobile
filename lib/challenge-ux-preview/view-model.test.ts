import assert from 'node:assert/strict';
import test from 'node:test';

// Relative imports (not `@/`) — see the note in lib/challenge-ux-preview/view-model.ts.
import { ChallengeId, IsoDateTime, UserId } from '../../domain/challenge/types';
import { evaluateChallenge } from '../../domain/challenge/results';
import { CHALLENGE_UX_SCENARIOS, findScenario } from '../../fixtures/challenge-ux-preview/scenarios';
import { buildEvent, buildPeriod } from '../../fixtures/challenge-ux-preview/builders';
import { buildActiveChallengeViewModel, describeFact, describePeriodTarget } from './view-model';

// Every one of the 21 named review states resolves to the specific,
// domain-derived status it is supposed to demonstrate — this both documents
// intent and guards against a fixture silently drifting out of sync with the
// engine (e.g. a timestamp edit that quietly changes which branch fires).
const EXPECTED_STATUS: Record<string, string> = {
  'build-active-nothing-due': 'calm',
  'build-daily-due': 'check_in_due',
  'build-daily-reported-done': 'reported',
  'build-weekly-report-total': 'calm',
  'build-late-reporting-open': 'late_check_in',
  'build-missed-deadline': 'missed',
  'build-correction-available': 'late_reported',
  'build-correction-closed': 'closed_satisfied',
  'cut-back-report-total': 'calm',
  'cut-back-within-limit': 'reported',
  'cut-back-over-limit': 'reported',
  'cut-back-correction': 'reported',
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
  assert.equal(within.currentPeriodCopy, '2 of 3 meals — within the limit.');
  const over = buildActiveChallengeViewModel(findScenario('cut-back-over-limit'));
  assert.equal(over.currentPeriodCopy, '5 of 3 meals — over the limit.');
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
