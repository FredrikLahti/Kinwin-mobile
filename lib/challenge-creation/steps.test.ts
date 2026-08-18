import assert from 'node:assert/strict';
import test from 'node:test';

import { getStepInfo, resolvePreviousCreationRoute } from './steps';

test('getStepInfo: build has one extra step (frequency) than limit/avoid', () => {
  assert.deepEqual(getStepInfo('build', 'goal'), { currentStep: 1, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'type'), { currentStep: 2, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'rule'), { currentStep: 3, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'frequency'), { currentStep: 4, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'duration'), { currentStep: 5, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'success_means'), { currentStep: 6, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'recipients'), { currentStep: 7, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'consequence'), { currentStep: 8, totalSteps: 9 });
  assert.deepEqual(getStepInfo('build', 'review'), { currentStep: 9, totalSteps: 9 });
});

test('getStepInfo: limit skips the frequency step', () => {
  assert.deepEqual(getStepInfo('cut', 'rule'), { currentStep: 3, totalSteps: 8 });
  assert.deepEqual(getStepInfo('cut', 'duration'), { currentStep: 4, totalSteps: 8 });
  assert.deepEqual(getStepInfo('cut', 'success_means'), { currentStep: 5, totalSteps: 8 });
  assert.deepEqual(getStepInfo('cut', 'review'), { currentStep: 8, totalSteps: 8 });
});

test('getStepInfo: avoid skips the frequency step, same shape as limit', () => {
  assert.deepEqual(getStepInfo('stop', 'rule'), { currentStep: 3, totalSteps: 8 });
  assert.deepEqual(getStepInfo('stop', 'duration'), { currentStep: 4, totalSteps: 8 });
  assert.deepEqual(getStepInfo('stop', 'success_means'), { currentStep: 5, totalSteps: 8 });
  assert.deepEqual(getStepInfo('stop', 'review'), { currentStep: 8, totalSteps: 8 });
});

test('getStepInfo: unknown direction (not chosen yet) defaults to build\'s longer sequence', () => {
  assert.deepEqual(getStepInfo(null, 'goal'), { currentStep: 1, totalSteps: 9 });
  assert.deepEqual(getStepInfo(null, 'type'), { currentStep: 2, totalSteps: 9 });
});

test('resolvePreviousCreationRoute: Goal is the only logical route whose Back may leave creation', () => {
  assert.equal(resolvePreviousCreationRoute('/create/goal', 'build'), null);
  assert.equal(resolvePreviousCreationRoute('/create/goal', 'cut'), null);
  assert.equal(resolvePreviousCreationRoute('/create/goal', 'stop'), null);
  assert.equal(resolvePreviousCreationRoute('/create/goal', null), null);
});

test('resolvePreviousCreationRoute: Type always resolves back to Goal, regardless of direction', () => {
  assert.equal(resolvePreviousCreationRoute('/create/type', 'build'), '/create/goal');
  assert.equal(resolvePreviousCreationRoute('/create/type', 'cut'), '/create/goal');
  assert.equal(resolvePreviousCreationRoute('/create/type', 'stop'), '/create/goal');
  assert.equal(resolvePreviousCreationRoute('/create/type', null), '/create/goal');
});

test('resolvePreviousCreationRoute: Build sequence — goal, type, build, frequency, duration, success-means, recipients, consequence, review', () => {
  assert.equal(resolvePreviousCreationRoute('/create/build', 'build'), '/create/type');
  // resume at Frequency -> Back resolves to Build rule
  assert.equal(resolvePreviousCreationRoute('/create/frequency', 'build'), '/create/build');
  // resume at Duration for Build -> Back resolves to Frequency
  assert.equal(resolvePreviousCreationRoute('/create/duration', 'build'), '/create/frequency');
  // resume at Success Means -> Back resolves to Duration
  assert.equal(resolvePreviousCreationRoute('/create/success-means', 'build'), '/create/duration');
  assert.equal(resolvePreviousCreationRoute('/create/recipients', 'build'), '/create/success-means');
  assert.equal(resolvePreviousCreationRoute('/create/consequence', 'build'), '/create/recipients');
  // resume at Review -> Back resolves to Consequence
  assert.equal(resolvePreviousCreationRoute('/create/review', 'build'), '/create/consequence');
});

test('resolvePreviousCreationRoute: Limit (cut) sequence skips frequency entirely', () => {
  assert.equal(resolvePreviousCreationRoute('/create/limit', 'cut'), '/create/type');
  // resume at Duration for Limit -> Back resolves to Limit rule
  assert.equal(resolvePreviousCreationRoute('/create/duration', 'cut'), '/create/limit');
  assert.equal(resolvePreviousCreationRoute('/create/success-means', 'cut'), '/create/duration');
  assert.equal(resolvePreviousCreationRoute('/create/recipients', 'cut'), '/create/success-means');
  assert.equal(resolvePreviousCreationRoute('/create/consequence', 'cut'), '/create/recipients');
  assert.equal(resolvePreviousCreationRoute('/create/review', 'cut'), '/create/consequence');
});

test('resolvePreviousCreationRoute: Avoid (stop) sequence skips frequency entirely', () => {
  assert.equal(resolvePreviousCreationRoute('/create/avoid', 'stop'), '/create/type');
  // resume at Duration for Avoid -> Back resolves to Avoid rule
  assert.equal(resolvePreviousCreationRoute('/create/duration', 'stop'), '/create/avoid');
  assert.equal(resolvePreviousCreationRoute('/create/success-means', 'stop'), '/create/duration');
  assert.equal(resolvePreviousCreationRoute('/create/recipients', 'stop'), '/create/success-means');
  assert.equal(resolvePreviousCreationRoute('/create/consequence', 'stop'), '/create/recipients');
  assert.equal(resolvePreviousCreationRoute('/create/review', 'stop'), '/create/consequence');
});

test('resolvePreviousCreationRoute: an unrecognized route is treated conservatively as the flow boundary, not a crash', () => {
  assert.equal(resolvePreviousCreationRoute('/create/share', 'build'), null);
  assert.equal(resolvePreviousCreationRoute('not-a-route-at-all', 'build'), null);
});
