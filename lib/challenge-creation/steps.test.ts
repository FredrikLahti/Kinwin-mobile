import assert from 'node:assert/strict';
import test from 'node:test';

import { getStepInfo } from './steps';

test('getStepInfo: build has one extra step (frequency) than limit/avoid', () => {
  assert.deepEqual(getStepInfo('build', 'goal'), { currentStep: 1, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'type'), { currentStep: 2, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'rule'), { currentStep: 3, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'frequency'), { currentStep: 4, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'duration'), { currentStep: 5, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'recipients'), { currentStep: 6, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'consequence'), { currentStep: 7, totalSteps: 8 });
  assert.deepEqual(getStepInfo('build', 'review'), { currentStep: 8, totalSteps: 8 });
});

test('getStepInfo: limit skips the frequency step', () => {
  assert.deepEqual(getStepInfo('cut', 'rule'), { currentStep: 3, totalSteps: 7 });
  assert.deepEqual(getStepInfo('cut', 'duration'), { currentStep: 4, totalSteps: 7 });
  assert.deepEqual(getStepInfo('cut', 'review'), { currentStep: 7, totalSteps: 7 });
});

test('getStepInfo: avoid skips the frequency step, same shape as limit', () => {
  assert.deepEqual(getStepInfo('stop', 'rule'), { currentStep: 3, totalSteps: 7 });
  assert.deepEqual(getStepInfo('stop', 'duration'), { currentStep: 4, totalSteps: 7 });
  assert.deepEqual(getStepInfo('stop', 'review'), { currentStep: 7, totalSteps: 7 });
});

test('getStepInfo: unknown direction (not chosen yet) defaults to build\'s longer sequence', () => {
  assert.deepEqual(getStepInfo(null, 'goal'), { currentStep: 1, totalSteps: 8 });
  assert.deepEqual(getStepInfo(null, 'type'), { currentStep: 2, totalSteps: 8 });
});
