import assert from 'node:assert/strict';
import test from 'node:test';

import { describeAccountDeletionBlocker } from './account-deletion';

test('describeAccountDeletionBlocker: active_challenge names the actual blocker, not a database status', () => {
  const message = describeAccountDeletionBlocker('active_challenge');
  assert.equal(message, 'Finish or cancel your current challenge before deleting your account.');
});

test('describeAccountDeletionBlocker: payment_recovery_pending', () => {
  const message = describeAccountDeletionBlocker('payment_recovery_pending');
  assert.equal(message, 'A payment from a failed challenge still needs to be resolved before you can delete your account.');
});

test('describeAccountDeletionBlocker: reward_fulfillment_pending', () => {
  const message = describeAccountDeletionBlocker('reward_fulfillment_pending');
  assert.equal(message, 'A reward from a failed challenge still needs to be delivered before you can delete your account.');
});

test('describeAccountDeletionBlocker: an unrecognized reason still gets a safe, generic message, never a blank or thrown error', () => {
  const message = describeAccountDeletionBlocker('some_future_reason_this_client_does_not_know_about');
  assert.equal(message, 'Your account can’t be deleted right now. Try again later, or contact support if this continues.');
});
