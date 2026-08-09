import assert from 'node:assert/strict';
import test from 'node:test';

import { describeChallengeRule } from './summary';

const BLANK_RHYTHM = { amountUnit: '', period: null, selectedWeekdays: [], targetValue: '', timeUnit: null, type: null };

test('describeChallengeRule: Build — Walk for at least 20 minutes, 3 times per week', () => {
  const summary = describeChallengeRule({
    behaviorDirection: 'build',
    behaviorText: 'Walk for at least 20 minutes',
    measurementMode: 'completion',
    rhythm: { ...BLANK_RHYTHM, type: 'weekly_count', targetValue: '3' },
  });
  assert.equal(summary, 'Walk for at least 20 minutes, 3 times per week');
});

test('describeChallengeRule: Build daily', () => {
  const summary = describeChallengeRule({
    behaviorDirection: 'build',
    behaviorText: 'Floss',
    measurementMode: 'completion',
    rhythm: { ...BLANK_RHYTHM, type: 'daily' },
  });
  assert.equal(summary, 'Floss, every day');
});

test('describeChallengeRule: Limit — Social media: maximum 3 hours per week', () => {
  const summary = describeChallengeRule({
    behaviorDirection: 'cut',
    behaviorText: 'Social media',
    measurementMode: 'time',
    rhythm: { ...BLANK_RHYTHM, type: 'maximum_per_period', targetValue: '3', period: 'week', timeUnit: 'hours' },
  });
  assert.equal(summary, 'Social media: maximum 3 hours per week');
});

test('describeChallengeRule: Limit with a custom amount unit', () => {
  const summary = describeChallengeRule({
    behaviorDirection: 'cut',
    behaviorText: 'Fast food',
    measurementMode: 'amount',
    rhythm: { ...BLANK_RHYTHM, type: 'maximum_per_period', targetValue: '2', period: 'week', amountUnit: 'meals' },
  });
  assert.equal(summary, 'Fast food: maximum 2 meals per week');
});

test('describeChallengeRule: Avoid — No smoking', () => {
  const summary = describeChallengeRule({
    behaviorDirection: 'stop',
    behaviorText: 'Smoking',
    measurementMode: 'abstinence',
    rhythm: { ...BLANK_RHYTHM, type: 'continuous' },
  });
  assert.equal(summary, 'No smoking');
});

test('describeChallengeRule: empty behavior text returns empty string', () => {
  assert.equal(
    describeChallengeRule({ behaviorDirection: 'build', behaviorText: '  ', measurementMode: 'completion', rhythm: BLANK_RHYTHM }),
    '',
  );
});
