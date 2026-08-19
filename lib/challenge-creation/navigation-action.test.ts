import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecipientDraft } from '../../contexts/onboarding-context';

import { CreationSessionFields } from './creation-session';
import { classifyCreationRemovalAction, isBackLikeNavigationAction, shouldPreventCreationRemoval } from './navigation-action';

function emptyFields(): CreationSessionFields {
  return {
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
    recipients: [createRecipientDraft()],
    rewardOrganizer: null,
    rhythm: { amountUnit: '', period: null, selectedWeekdays: [], targetValue: '', timeUnit: null, type: null },
    sitOutAcknowledged: false,
    stakeAmount: null,
    stakeAmountInput: '',
    successThresholdOverride: null,
    currency: 'USD',
  };
}

test('isBackLikeNavigationAction: GO_BACK and every POP variant are back-like', () => {
  assert.equal(isBackLikeNavigationAction({ type: 'GO_BACK' }), true);
  assert.equal(isBackLikeNavigationAction({ type: 'POP' }), true);
  assert.equal(isBackLikeNavigationAction({ type: 'POP_TO_TOP' }), true);
  assert.equal(isBackLikeNavigationAction({ type: 'POP_TO' }), true);
});

test('isBackLikeNavigationAction: REPLACE, PUSH, NAVIGATE, and RESET are never back-like', () => {
  assert.equal(isBackLikeNavigationAction({ type: 'REPLACE' }), false);
  assert.equal(isBackLikeNavigationAction({ type: 'PUSH' }), false);
  assert.equal(isBackLikeNavigationAction({ type: 'NAVIGATE' }), false);
  assert.equal(isBackLikeNavigationAction({ type: 'RESET' }), false);
});

test('1. resumed Frequency + a back-like action redirects to the logical previous step (Build)', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'GO_BACK' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: false, // resumed mid-flow: no real /create/build entry in the actual stack
    navigationLocked: false,
    previousCreationRoute: '/create/build',
  });
  assert.deepEqual(decision, { kind: 'redirect', route: '/create/build' });
});

test('2. resumed Frequency + an intentional REPLACE (e.g. Save & exit -> Home) is allowed, never redirected', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'REPLACE' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: '/create/build',
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('3. resumed Review + a back-like action redirects to the logical previous step (Consequence)', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'POP' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: '/create/consequence',
  });
  assert.deepEqual(decision, { kind: 'redirect', route: '/create/consequence' });
});

test('4. resumed Review + an intentional REPLACE to Share (successful server conversion) is allowed', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'REPLACE' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: '/create/consequence',
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('5. Goal (previousCreationRoute null) + a back-like action with unsaved work confirms before leaving', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'GO_BACK' },
    checkpointFields: null,
    currentFields: { ...emptyFields(), goal: 'Sleep better' },
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: null,
  });
  assert.deepEqual(decision, { kind: 'confirm_leave_without_saving' });
});

test('6. Goal + an intentional replacement is allowed without ever showing the leave-without-saving confirmation', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'REPLACE' },
    checkpointFields: null,
    currentFields: { ...emptyFields(), goal: 'Sleep better' },
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: null,
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('7. navigationLocked blocks a genuine user Back', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'GO_BACK' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: true,
    navigationLocked: true,
    previousCreationRoute: '/create/consequence',
  });
  assert.deepEqual(decision, { kind: 'blocked' });
});

test('8. navigationLocked never blocks an intentional programmatic replacement — the lock only ever applies to back-like actions', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'REPLACE' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: true,
    navigationLocked: true,
    previousCreationRoute: '/create/consequence',
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('a back-like action with a genuine previous stack entry (normal step-by-step navigation, not a resume) is allowed — the native pop already lands on the right screen', () => {
  const decision = classifyCreationRemovalAction({
    action: { type: 'GO_BACK' },
    checkpointFields: null,
    currentFields: emptyFields(),
    nativeStackHasPreviousEntry: true,
    navigationLocked: false,
    previousCreationRoute: '/create/build',
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('Goal + a back-like action with no unsaved work (matches an existing checkpoint) is allowed without confirmation', () => {
  const fields = { ...emptyFields(), goal: 'Already saved' };
  const decision = classifyCreationRemovalAction({
    action: { type: 'GO_BACK' },
    checkpointFields: fields,
    currentFields: fields,
    nativeStackHasPreviousEntry: false,
    navigationLocked: false,
    previousCreationRoute: null,
  });
  assert.deepEqual(decision, { kind: 'allow' });
});

test('shouldPreventCreationRemoval: arms protection for a resumed mid-flow shallow stack', () => {
  assert.equal(
    shouldPreventCreationRemoval({
      checkpointFields: null,
      currentFields: emptyFields(),
      nativeStackHasPreviousEntry: false,
      navigationLocked: false,
      previousCreationRoute: '/create/build',
    }),
    true,
  );
});

test('shouldPreventCreationRemoval: arms protection at Goal with unsaved work', () => {
  assert.equal(
    shouldPreventCreationRemoval({
      checkpointFields: null,
      currentFields: { ...emptyFields(), goal: 'Sleep better' },
      nativeStackHasPreviousEntry: false,
      navigationLocked: false,
      previousCreationRoute: null,
    }),
    true,
  );
});

test('shouldPreventCreationRemoval: arms protection while navigationLocked, regardless of the native stack shape', () => {
  assert.equal(
    shouldPreventCreationRemoval({
      checkpointFields: null,
      currentFields: emptyFields(),
      nativeStackHasPreviousEntry: true,
      navigationLocked: true,
      previousCreationRoute: '/create/consequence',
    }),
    true,
  );
});

test('shouldPreventCreationRemoval: does not arm protection for normal mid-flow navigation with a valid native previous entry', () => {
  assert.equal(
    shouldPreventCreationRemoval({
      checkpointFields: null,
      currentFields: emptyFields(),
      nativeStackHasPreviousEntry: true,
      navigationLocked: false,
      previousCreationRoute: '/create/build',
    }),
    false,
  );
});

test('shouldPreventCreationRemoval: does not arm protection at Goal with no unsaved work', () => {
  const fields = { ...emptyFields(), goal: 'Already saved' };
  assert.equal(
    shouldPreventCreationRemoval({
      checkpointFields: fields,
      currentFields: fields,
      nativeStackHasPreviousEntry: false,
      navigationLocked: false,
      previousCreationRoute: null,
    }),
    false,
  );
});
