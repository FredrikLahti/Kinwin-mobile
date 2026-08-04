import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialOnboardingFields } from './onboarding-context';

test('createInitialOnboardingFields carries no leftover data — every field is a blank default', () => {
  const fields = createInitialOnboardingFields();
  assert.deepEqual(fields, {
    behaviorDirection: null,
    behaviorText: '',
    definitionText: '',
    durationWeeks: null,
    experienceCategory: null,
    goal: '',
    invitationMessage: '',
    invitationMessageCustomized: false,
    membershipChoice: null,
    measurementMode: null,
    rewardOrganizer: null,
    rhythm: {
      amountUnit: '',
      period: null,
      selectedWeekdays: [],
      targetValue: '',
      timeUnit: null,
      type: null,
    },
    savedDraftId: null,
    sitOutAcknowledged: false,
    stakeAmount: null,
    stakeAmountInput: '',
  });
});

test('createInitialOnboardingFields returns a fresh rhythm object each call, so resetting one draft cannot mutate another', () => {
  const first = createInitialOnboardingFields();
  const second = createInitialOnboardingFields();
  assert.notEqual(first.rhythm, second.rhythm, 'rhythm must be a distinct object per call');
  first.rhythm.selectedWeekdays.push('monday');
  assert.deepEqual(second.rhythm.selectedWeekdays, [], 'mutating one snapshot must not affect another');
});
