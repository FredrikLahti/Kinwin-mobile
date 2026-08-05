import assert from 'node:assert/strict';
import test from 'node:test';

import { pollForAuthorization } from './poll-authorization';

function mutableSignal() {
  return { aborted: false };
}

test('stops as soon as check reports authorized, without waiting out the full schedule', async () => {
  let calls = 0;
  const waits: number[] = [];
  const outcome = await pollForAuthorization(
    async () => {
      calls += 1;
      return { authorized: calls === 2 };
    },
    { signal: mutableSignal(), delaysMs: [10, 20, 30], wait: async (ms) => { waits.push(ms); } },
  );
  assert.equal(outcome, 'authorized');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [10]);
});

test('times out after the schedule is exhausted without ever becoming authorized', async () => {
  let calls = 0;
  const outcome = await pollForAuthorization(
    async () => { calls += 1; return { authorized: false }; },
    { signal: mutableSignal(), delaysMs: [10, 20], wait: async () => {} },
  );
  assert.equal(outcome, 'timeout');
  // One check per delay, plus one final check after the last wait.
  assert.equal(calls, 3);
});

test('stops immediately when the signal is already aborted, making no check at all', async () => {
  let calls = 0;
  const outcome = await pollForAuthorization(
    async () => { calls += 1; return { authorized: false }; },
    { signal: { aborted: true }, delaysMs: [10, 20] },
  );
  assert.equal(outcome, 'aborted');
  assert.equal(calls, 0);
});

test('stops between attempts when the signal is aborted mid-flight (e.g. unmount or navigating away)', async () => {
  const signal = mutableSignal();
  let calls = 0;
  const outcome = await pollForAuthorization(
    async () => {
      calls += 1;
      if (calls === 1) signal.aborted = true;
      return { authorized: false };
    },
    { signal, delaysMs: [10, 20, 30], wait: async () => { throw new Error('must not wait after abort'); } },
  );
  assert.equal(outcome, 'aborted');
  assert.equal(calls, 1);
});
