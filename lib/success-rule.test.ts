// calculateSuccessRule backs every rule-entry step's Continue gate on
// app/create/duration.tsx (`canContinue = durationIsValid && Boolean(rule)`)
// but had no direct test coverage at all before this file — a device-beta
// report of Avoid ("stop" direction) getting permanently stuck on this step
// could not be verified or ruled out without one. Each fixture below
// mirrors exactly the onboarding-context state the matching rule-entry
// screen sets (avoid.tsx, cut_back's rule screen, build's frequency screen)
// rather than any literal goal/behavior text, so this covers the three
// challenge types generically, not any one specific wording.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { RhythmState } from '@/contexts/onboarding-context';

import { calculateSuccessRule } from './success-rule';

const EMPTY_RHYTHM: RhythmState = {
  amountUnit: '', period: null, selectedWeekdays: [], targetValue: '', timeUnit: null, type: null,
};

const BASE = {
  behaviorText: 'A generic behavior',
  definitionText: 'A generic definition',
  goal: 'A generic goal',
};

test('Avoid (stop direction): the exact state avoid.tsx sets resolves at every valid duration, 2 through 12', () => {
  for (let durationWeeks = 2; durationWeeks <= 12; durationWeeks += 1) {
    const rule = calculateSuccessRule({
      ...BASE,
      behaviorDirection: 'stop',
      durationWeeks,
      measurementMode: 'abstinence',
      rhythm: { ...EMPTY_RHYTHM, type: 'continuous' },
    });
    assert.ok(rule, `expected a resolved rule at durationWeeks=${durationWeeks}`);
    assert.equal(rule?.isStopRule, true);
  }
});

test('Avoid (stop direction): a duration below the 2-week minimum never resolves, matching Continue staying disabled', () => {
  const rule = calculateSuccessRule({
    ...BASE,
    behaviorDirection: 'stop',
    durationWeeks: 1,
    measurementMode: 'abstinence',
    rhythm: { ...EMPTY_RHYTHM, type: 'continuous' },
  });
  assert.equal(rule, null);
});

test('Build, daily rhythm: resolves at every valid duration', () => {
  for (const durationWeeks of [2, 12]) {
    const rule = calculateSuccessRule({
      ...BASE,
      behaviorDirection: 'build',
      durationWeeks,
      measurementMode: 'completion',
      rhythm: { ...EMPTY_RHYTHM, type: 'daily' },
    });
    assert.ok(rule, `expected a resolved rule at durationWeeks=${durationWeeks}`);
    assert.equal(rule?.isStopRule, false);
  }
});

test('Build, weekly_count rhythm: resolves once a positive target is set', () => {
  const rule = calculateSuccessRule({
    ...BASE,
    behaviorDirection: 'build',
    durationWeeks: 4,
    measurementMode: 'completion',
    rhythm: { ...EMPTY_RHYTHM, type: 'weekly_count', targetValue: '3' },
  });
  assert.ok(rule);
});

test('Build, specific_days rhythm: resolves once the selected weekdays are set', () => {
  const rule = calculateSuccessRule({
    ...BASE,
    behaviorDirection: 'build',
    durationWeeks: 4,
    measurementMode: 'completion',
    rhythm: { ...EMPTY_RHYTHM, type: 'specific_days', selectedWeekdays: ['monday', 'wednesday', 'friday'] },
  });
  assert.ok(rule);
});

test('Cut back (limit), day boundary: resolves once a target/unit are set', () => {
  const rule = calculateSuccessRule({
    ...BASE,
    behaviorDirection: 'cut',
    durationWeeks: 4,
    measurementMode: 'time',
    rhythm: { ...EMPTY_RHYTHM, type: 'maximum_per_period', period: 'day', targetValue: '120', timeUnit: 'minutes' },
  });
  assert.ok(rule);
});

test('Cut back (limit), week boundary: resolves once a target/unit are set', () => {
  const rule = calculateSuccessRule({
    ...BASE,
    behaviorDirection: 'cut',
    durationWeeks: 4,
    measurementMode: 'amount',
    rhythm: { ...EMPTY_RHYTHM, type: 'maximum_per_period', period: 'week', targetValue: '50', amountUnit: 'USD' },
  });
  assert.ok(rule);
});

test('Any direction: incomplete prior text (goal/behavior/definition under 3 chars) never resolves', () => {
  const rule = calculateSuccessRule({
    behaviorDirection: 'stop',
    behaviorText: 'ok',
    definitionText: 'A generic definition',
    durationWeeks: 4,
    goal: 'A generic goal',
    measurementMode: 'abstinence',
    rhythm: { ...EMPTY_RHYTHM, type: 'continuous' },
  });
  assert.equal(rule, null);
});

// Success Means: calculateSuccessRule's optional second parameter is what
// app/create/success-means.tsx's live preview and app/create/review.tsx's
// SUCCESS section both read from — the Review screen must show the user's
// ACTUAL selection, never silently fall back to displaying the baseline
// while a stricter value is what's really persisted (or vice versa).
test('Build (daily), a stricter selected threshold changes the displayed "overall" text to the real selection, not the baseline', () => {
  const baselineRule = calculateSuccessRule({
    ...BASE, behaviorDirection: 'build', durationWeeks: 4, measurementMode: 'completion',
    rhythm: { ...EMPTY_RHYTHM, type: 'daily' },
  });
  assert.ok(baselineRule);
  assert.equal(baselineRule!.overall, 'Keep your promise on at least 25 of 28 days.');

  const stricterRule = calculateSuccessRule({
    ...BASE, behaviorDirection: 'build', durationWeeks: 4, measurementMode: 'completion',
    rhythm: { ...EMPTY_RHYTHM, type: 'daily' },
  }, 27);
  assert.ok(stricterRule);
  assert.equal(stricterRule!.overall, 'Keep your promise on at least 27 of 28 days.');
  // Continuity is a fixed safeguard, unaffected by the overall threshold.
  assert.equal(stricterRule!.continuity, baselineRule!.continuity);
});

test('Cut back (day), a stricter selected threshold changes the displayed "overall" text', () => {
  const stricterRule = calculateSuccessRule({
    ...BASE, behaviorDirection: 'cut', durationWeeks: 4, measurementMode: 'time',
    rhythm: { ...EMPTY_RHYTHM, type: 'maximum_per_period', period: 'day', targetValue: '120', timeUnit: 'minutes' },
  }, 27);
  assert.ok(stricterRule);
  assert.equal(stricterRule!.overall, 'Stay within your limit on at least 27 of 28 days.');
});

test('Avoid: a selectedThreshold argument is ignored entirely — it always shows the fixed zero-lapse statement', () => {
  const rule = calculateSuccessRule({
    ...BASE, behaviorDirection: 'stop', durationWeeks: 6, measurementMode: 'abstinence',
    rhythm: { ...EMPTY_RHYTHM, type: 'continuous' },
  }, 999);
  assert.ok(rule);
  assert.equal(rule!.overall, 'No lapses during the full 6-week challenge.');
  assert.equal(rule!.isStopRule, true);
});

test('A below-baseline selectedThreshold is clamped up to the baseline rather than producing an invalid/null rule', () => {
  const rule = calculateSuccessRule({
    ...BASE, behaviorDirection: 'build', durationWeeks: 4, measurementMode: 'completion',
    rhythm: { ...EMPTY_RHYTHM, type: 'daily' },
  }, 1); // below the baseline of 25
  assert.ok(rule);
  assert.equal(rule!.overall, 'Keep your promise on at least 25 of 28 days.');
});
