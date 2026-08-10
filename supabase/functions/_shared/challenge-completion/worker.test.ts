import assert from 'node:assert/strict';
import test from 'node:test';

import { runScheduledChallengeCompletion } from './worker.ts';

test('one bad challenge does not prevent later eligible challenges from finalizing', async () => {
  const finalized: string[] = [];
  const failures: string[] = [];
  let finishedStatus = '';

  const result = await runScheduledChallengeCompletion({
    start: async () => ({ status: 'started', runId: 'run-1', leaseToken: 'lease-1' }),
    claimDue: async () => [
      { challengeId: 'bad', ownerId: 'owner-1', previousStatus: 'active' },
      { challengeId: 'success', ownerId: 'owner-2', previousStatus: 'awaiting_resolution' },
      { challengeId: 'failure', ownerId: 'owner-3', previousStatus: 'completion_mode' },
    ],
    finalize: async (challenge) => {
      finalized.push(challenge.challengeId);
      if (challenge.challengeId === 'bad') throw { code: 'malformed_fixture' };
      return challenge.challengeId === 'success'
        ? { kind: 'terminal', status: 'completed_success' }
        : { kind: 'terminal', status: 'completed_failure' };
    },
    recordFailure: async (_run, _lease, challengeId, code) => { failures.push(`${challengeId}:${code}`); },
    finish: async (_run, _lease, status) => { finishedStatus = status; },
  });

  assert.deepEqual(finalized, ['bad', 'success', 'failure']);
  assert.deepEqual(failures, ['bad:malformed_fixture']);
  assert.equal(finishedStatus, 'partial_failure');
  assert.deepEqual(result, {
    status: 'partial_failure', runId: 'run-1', eligible: 3, reconciled: 2,
    finalizedSuccess: 1, finalizedFailure: 1, failed: 1,
  });
});

test('overlapping run exits without claiming or finalizing work', async () => {
  let touched = false;
  const result = await runScheduledChallengeCompletion({
    start: async () => ({ status: 'already_running', runId: 'existing-run' }),
    claimDue: async () => { touched = true; return []; },
    finalize: async () => { touched = true; return { kind: 'terminal', status: 'completed_success' }; },
    recordFailure: async () => { touched = true; },
    finish: async () => { touched = true; },
  });
  assert.equal(touched, false);
  assert.deepEqual(result, { status: 'already_running', runId: 'existing-run' });
});
