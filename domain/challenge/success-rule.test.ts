import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySuccessThreshold,
  clampSuccessThreshold,
  deriveStructuredSuccessRule,
  deriveSuccessRuleForChallengeRule,
  successThresholdBounds,
} from './success-rule';
import type { ChallengeRule, SuccessRuleSnapshot } from './types';

const DAILY_4_WEEKS: ChallengeRule = {
  direction: 'build',
  measurement: { type: 'completion', unit: 'completion' },
  rhythm: { type: 'daily', periodUnit: 'day', target: 1 },
};

function buildBaseline(): Extract<SuccessRuleSnapshot, { direction: 'build' }> {
  const rule = deriveSuccessRuleForChallengeRule(DAILY_4_WEEKS, 4);
  assert.ok(rule && rule.direction === 'build');
  return rule as Extract<SuccessRuleSnapshot, { direction: 'build' }>;
}

const LIMIT_4_WEEKS_DAY: ChallengeRule = {
  direction: 'cut_back',
  measurement: { type: 'count', unit: 'drinks' },
  boundary: { periodUnit: 'day', maximumValue: 3 },
};

function cutBackBaseline(): Extract<SuccessRuleSnapshot, { direction: 'cut_back' }> {
  const rule = deriveSuccessRuleForChallengeRule(LIMIT_4_WEEKS_DAY, 4);
  assert.ok(rule && rule.direction === 'cut_back');
  return rule as Extract<SuccessRuleSnapshot, { direction: 'cut_back' }>;
}

const STOP_2_WEEKS: ChallengeRule = {
  direction: 'stop',
  measurement: { type: 'abstinence', unit: 'lapse' },
  boundary: { periodUnit: 'challenge', maximumLapses: 0 },
};

test('deriveSuccessRuleForChallengeRule: 4 weeks daily yields the documented baseline (28 total, 25 required)', () => {
  const baseline = buildBaseline();
  assert.equal(baseline.totalPlannedCompletions, 28);
  assert.equal(baseline.minimumRequiredCompletions, 25);
  assert.equal(baseline.ruleVersion, 1);
});

test('successThresholdBounds: build/cut_back report [baseline minimum, total]; stop has no bounds at all', () => {
  assert.deepEqual(successThresholdBounds(buildBaseline()), { minimum: 25, total: 28 });
  assert.deepEqual(successThresholdBounds(cutBackBaseline()), { minimum: 25, total: 28 });
  const stopBaseline = deriveSuccessRuleForChallengeRule(STOP_2_WEEKS, 2)!;
  assert.equal(successThresholdBounds(stopBaseline), null);
});

test('applySuccessThreshold: null or the baseline value both yield the baseline back unchanged (ruleVersion 1)', () => {
  const baseline = buildBaseline();
  assert.deepEqual(applySuccessThreshold(baseline, null), baseline);
  assert.deepEqual(applySuccessThreshold(baseline, 25), baseline);
});

test('applySuccessThreshold: V2 lower bound — cannot select below the baseline', () => {
  const baseline = buildBaseline();
  assert.equal(applySuccessThreshold(baseline, 24), null);
  assert.equal(applySuccessThreshold(baseline, 1), null);
});

test('applySuccessThreshold: V2 upper bound — cannot select above the total', () => {
  const baseline = buildBaseline();
  assert.equal(applySuccessThreshold(baseline, 29), null);
  assert.equal(applySuccessThreshold(baseline, 1000), null);
});

test('applySuccessThreshold: a value strictly within bounds produces a ruleVersion 2 snapshot with only the minimum changed', () => {
  const baseline = buildBaseline();
  const stricter = applySuccessThreshold(baseline, 27);
  assert.ok(stricter && stricter.direction === 'build');
  assert.equal(stricter!.ruleVersion, 2);
  assert.equal((stricter as typeof baseline).minimumRequiredCompletions, 27);
  assert.equal((stricter as typeof baseline).totalPlannedCompletions, baseline.totalPlannedCompletions);
  assert.equal((stricter as typeof baseline).periodTarget, baseline.periodTarget);
  assert.equal((stricter as typeof baseline).periodUnit, baseline.periodUnit);
  assert.deepEqual((stricter as typeof baseline).continuitySafeguard, baseline.continuitySafeguard);
});

test('applySuccessThreshold: exactly the total is a valid (maximally strict) V2 selection', () => {
  const baseline = buildBaseline();
  const strictest = applySuccessThreshold(baseline, 28);
  assert.ok(strictest);
  assert.equal(strictest!.ruleVersion, 2);
});

test('applySuccessThreshold: rejects a non-integer selection', () => {
  const baseline = buildBaseline();
  assert.equal(applySuccessThreshold(baseline, 27.5), null);
});

test('applySuccessThreshold: cut_back (Limit) V2 bounds mirror build exactly', () => {
  const baseline = cutBackBaseline();
  assert.equal(applySuccessThreshold(baseline, 10), null, 'below baseline');
  assert.equal(applySuccessThreshold(baseline, 999), null, 'above total');
  const stricter = applySuccessThreshold(baseline, 27);
  assert.ok(stricter && stricter.direction === 'cut_back');
  assert.equal(stricter!.ruleVersion, 2);
  assert.equal((stricter as typeof baseline).minimumPeriodsWithinLimit, 27);
  assert.equal((stricter as typeof baseline).maximumAllowedValue, baseline.maximumAllowedValue);
  assert.deepEqual((stricter as typeof baseline).continuitySafeguard, baseline.continuitySafeguard);
});

test('applySuccessThreshold: Avoid (stop) has no adjustable threshold — any selection returns the baseline untouched', () => {
  const baseline = deriveSuccessRuleForChallengeRule(STOP_2_WEEKS, 2)!;
  assert.deepEqual(applySuccessThreshold(baseline, 999), baseline);
  assert.deepEqual(applySuccessThreshold(baseline, null), baseline);
  assert.equal(baseline.direction === 'stop' && baseline.lapseRule.type, 'zero_lapses');
});

test('clampSuccessThreshold: null clamps to the baseline (the default-to-baseline policy for a newly configured challenge)', () => {
  assert.equal(clampSuccessThreshold(null, { minimum: 25, total: 28 }), 25);
});

test('clampSuccessThreshold: a value already in range is preserved untouched (stricter intent survives)', () => {
  assert.equal(clampSuccessThreshold(27, { minimum: 25, total: 28 }), 27);
});

test('clampSuccessThreshold: below the new baseline clamps up to it, never below', () => {
  assert.equal(clampSuccessThreshold(10, { minimum: 25, total: 28 }), 25);
});

test('clampSuccessThreshold: above the new total clamps down to it, never above', () => {
  assert.equal(clampSuccessThreshold(999, { minimum: 25, total: 28 }), 28);
});

test('deriveStructuredSuccessRule: upstream plan change (duration shrinks) safely reclamps a previously-valid stricter selection that no longer fits', () => {
  // 6 weeks daily -> total 42, baseline derived accordingly; user selects a
  // stricter-than-baseline value under that plan.
  const sixWeeks = deriveStructuredSuccessRule({ direction: 'build', measurement: 'completion', durationWeeks: 6, rhythm: { type: 'daily', period: 'day', targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' } }, 40);
  assert.ok(sixWeeks && sixWeeks.successRule.direction === 'build');
  assert.equal((sixWeeks!.successRule as Extract<SuccessRuleSnapshot, { direction: 'build' }>).minimumRequiredCompletions, 40);

  // Duration now shrinks to 2 weeks (total 14) — re-deriving with the same
  // stale selectedThreshold (40) must clamp down to the new total (14),
  // never reject or silently exceed it.
  const twoWeeks = deriveStructuredSuccessRule({ direction: 'build', measurement: 'completion', durationWeeks: 2, rhythm: { type: 'daily', period: 'day', targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' } }, 40);
  assert.ok(twoWeeks && twoWeeks.successRule.direction === 'build');
  const clamped = twoWeeks!.successRule as Extract<SuccessRuleSnapshot, { direction: 'build' }>;
  assert.equal(clamped.totalPlannedCompletions, 14);
  assert.equal(clamped.minimumRequiredCompletions, 14, 'clamped down to the new total, never left above it');
});

test('deriveStructuredSuccessRule: a stale selection below the new baseline is clamped up, never left weaker than the new baseline', () => {
  // 12 weeks daily has a much higher baseline than 4 weeks daily; simulate
  // a stale selection of 25 (valid for 4 weeks) surviving a duration
  // increase to 12 weeks (total 84).
  const result = deriveStructuredSuccessRule({ direction: 'build', measurement: 'completion', durationWeeks: 12, rhythm: { type: 'daily', period: 'day', targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' } }, 25);
  assert.ok(result && result.successRule.direction === 'build');
  const rule = result!.successRule as Extract<SuccessRuleSnapshot, { direction: 'build' }>;
  const baseline = deriveSuccessRuleForChallengeRule(result!.challengeRule, 12)!;
  assert.ok(baseline.direction === 'build');
  assert.ok(rule.minimumRequiredCompletions >= (baseline as typeof rule).minimumRequiredCompletions, 'must never end up below the freshly-derived baseline');
});
