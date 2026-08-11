import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseHomeChallengeSurface, describeChallengeResult } from './completed-challenge';

test('an active challenge takes precedence over a completed result', () => assert.equal(chooseHomeChallengeSurface('ready', 'ready'), 'active'));
test('a recent terminal result replaces the empty Home state', () => {
  assert.equal(chooseHomeChallengeSurface('none', 'ready'), 'completed');
  assert.equal(chooseHomeChallengeSurface('none', 'none'), 'empty');
});
test('success presentation says the failure consequence does not apply', () => {
  const result = describeChallengeResult('completed_success'); assert.equal(result.tone, 'success'); assert.match(result.meaning, /does not apply/);
});
test('failure presentation separates outcome from consequence processing', () => {
  const result = describeChallengeResult('completed_failure'); assert.equal(result.tone, 'failure'); assert.match(result.meaning, /handled separately/); assert.doesNotMatch(result.meaning, /charged|paid|delivered|fulfilled/i);
});
