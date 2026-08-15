import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRestoredCreationSessionState, createInitialOnboardingFields, createRecipientDraft } from './onboarding-context';

test('createInitialOnboardingFields carries no leftover data — every field is a blank default', () => {
  const fields = createInitialOnboardingFields();
  assert.deepEqual(fields, {
    behaviorDirection: null,
    behaviorText: '',
    checkpoint: null,
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

test('computeRestoredCreationSessionState always clears savedDraftId to null, even though the input type carries no such field, guarding against a stale server draft id surviving a local-session restore', () => {
  const fields = {
    ...createInitialOnboardingFields(),
    goal: 'Sleep better',
    recipients: [createRecipientDraft('Mom')],
  };
  // createInitialOnboardingFields() includes a savedDraftId field (it also
  // seeds resetDraft's baseline); restoreCreationSessionFields's real input
  // type never carries one, but this proves the guard holds even if a
  // caller's object happens to still have one attached, e.g. from spreading
  // an unrelated draft-shaped value.
  const withLeftoverDraftId = { ...fields, savedDraftId: 'server-draft-999' };
  const restored = computeRestoredCreationSessionState(withLeftoverDraftId, '/create/goal', '2026-01-01T00:00:00.000Z');
  assert.equal(restored.savedDraftId, null, 'a resumed local session must never carry a previous server draft id');
  assert.equal(restored.goal, 'Sleep better', 'restoring must not silently drop the real fields being restored');
});

test('computeRestoredCreationSessionState always sets the restored checkpoint to exactly the fields/lastRoute/savedAt being restored — restoring only ever happens for a session hooks/use-resumable-creation-session.ts already filtered down to an explicitly-saved one', () => {
  const fields = { ...createInitialOnboardingFields(), goal: 'Sleep better', recipients: [createRecipientDraft('Mom')] };
  const restored = computeRestoredCreationSessionState(fields, '/create/frequency', '2026-01-01T00:00:00.000Z');
  assert.deepEqual(restored.checkpoint, { fields, lastRoute: '/create/frequency', savedAt: '2026-01-01T00:00:00.000Z' });
});
