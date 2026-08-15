import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecipientDraft } from '../../contexts/onboarding-context';
import { mapOnboardingDraft, OnboardingDraftData } from '../../domain/challenge/from-onboarding-draft';

import {
  clearCreationSession,
  closeCreationSessionGeneration,
  createLatestRequestGuard,
  CreationSessionFields,
  CreationSessionStorage,
  creationSessionStorageKey,
  currentCreationSessionGeneration,
  decideCreateChallengeEntryAction,
  hasMeaningfulCreationProgress,
  planExitAttempt,
  readCreationSession,
  resolveResumeRoute,
  RESUMABLE_CREATION_ROUTES,
  writeCreationSession,
} from './creation-session';

// Most tests below aren't exercising the generation/lifecycle mechanism at
// all, so they just capture "whatever generation is current right now" —
// exactly what a real caller does for a normal, non-stale write.
function write(userId: string, fields: CreationSessionFields, lastRoute: string, storage: CreationSessionStorage) {
  return writeCreationSession(userId, fields, lastRoute, storage, currentCreationSessionGeneration(userId));
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

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
  };
}

function inMemoryStorage(seed: Record<string, string> = {}): CreationSessionStorage {
  const store = new Map(Object.entries(seed));
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async (key) => { store.delete(key); },
  };
}

test('hasMeaningfulCreationProgress: a completely blank draft is not meaningful', () => {
  assert.equal(hasMeaningfulCreationProgress(emptyFields()), false);
});

test('hasMeaningfulCreationProgress: a goal alone is meaningful', () => {
  assert.equal(hasMeaningfulCreationProgress({ ...emptyFields(), goal: 'Sleep better' }), true);
});

test('hasMeaningfulCreationProgress: a named recipient alone is meaningful even with everything else blank', () => {
  const fields = emptyFields();
  assert.equal(hasMeaningfulCreationProgress({ ...fields, recipients: [{ id: fields.recipients[0].id, name: 'Mom' }] }), true);
});

test('hasMeaningfulCreationProgress: a blank recipient placeholder alone is not meaningful', () => {
  assert.equal(hasMeaningfulCreationProgress(emptyFields()), false, 'the default single blank recipient must not count as progress');
});

test('writeCreationSession then readCreationSession round-trips every field, including nested rhythm and recipients', async () => {
  const storage = inMemoryStorage();
  const fields: CreationSessionFields = {
    ...emptyFields(),
    goal: 'Sleep better',
    behaviorText: 'Go to bed by 11pm',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { amountUnit: '', period: null, selectedWeekdays: ['monday', 'wednesday'], targetValue: '3', timeUnit: null, type: 'weekly_count' },
    durationWeeks: 6,
    recipients: [{ id: 'recipient-a', name: 'Mom' }, { id: 'recipient-b', name: 'Dad' }],
    rewardOrganizer: { type: 'recipient', recipientId: 'recipient-a' },
  };
  const ok = await write('user-1', fields, '/create/frequency', storage);
  assert.equal(ok, true, 'a successful write must report success');
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored);
  assert.equal(restored.lastRoute, '/create/frequency');
  assert.deepEqual(restored.fields, fields);
});

test('writeCreationSession honestly reports failure when the underlying storage write throws — the "your progress is saved" promise must never be made on a false premise', async () => {
  const storage: CreationSessionStorage = {
    getItem: async () => null,
    setItem: async () => { throw new Error('disk full'); },
    removeItem: async () => undefined,
  };
  const ok = await write('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.equal(ok, false);
});

test('readCreationSession returns null when nothing has ever been saved for that user', async () => {
  const storage = inMemoryStorage();
  assert.equal(await readCreationSession('nobody', storage), null);
});

test('user isolation: one signed-in user can never read another signed-in user\'s session', async () => {
  const storage = inMemoryStorage();
  await write('user-a', { ...emptyFields(), goal: 'User A\'s goal' }, '/create/goal', storage);
  await write('user-b', { ...emptyFields(), goal: 'User B\'s goal' }, '/create/goal', storage);

  const forA = await readCreationSession('user-a', storage);
  const forB = await readCreationSession('user-b', storage);
  assert.equal(forA?.fields.goal, 'User A\'s goal');
  assert.equal(forB?.fields.goal, 'User B\'s goal');
  assert.notEqual(creationSessionStorageKey('user-a'), creationSessionStorageKey('user-b'));
});

test('explicit discard: clearCreationSession removes the session so it is no longer readable', async () => {
  const storage = inMemoryStorage();
  await write('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.ok(await readCreationSession('user-1', storage));
  await clearCreationSession('user-1', storage);
  assert.equal(await readCreationSession('user-1', storage), null);
});

test('clearCreationSession on a user with no session is a safe no-op', async () => {
  const storage = inMemoryStorage();
  await assert.doesNotReject(clearCreationSession('user-1', storage));
});

test('write/clear ordering: a clear requested while an earlier write is still in flight always wins, even once that write is allowed to finish', async () => {
  const store = new Map<string, string>();
  const writeGate = deferred<void>();
  let writeStarted = false;
  const storage: CreationSessionStorage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      writeStarted = true;
      await writeGate.promise; // (A) the write has started but deliberately cannot finish yet
      store.set(key, value);
    },
    removeItem: async (key) => { store.delete(key); },
  };

  const writePromise = write('user-1', { ...emptyFields(), goal: 'Old goal' }, '/create/goal', storage);
  await Promise.resolve().then(() => Promise.resolve()); // let the write actually enter setItem and hang on the gate
  assert.equal(writeStarted, true, 'the write must genuinely be in flight before the clear is requested');

  const clearPromise = clearCreationSession('user-1', storage); // (B) clear requested before the write finishes — must queue behind it, not race it

  writeGate.resolve(); // (C) the old write is now allowed to finish
  const [writeOk, clearOk] = await Promise.all([writePromise, clearPromise]);
  assert.equal(writeOk, true);
  assert.equal(clearOk, true);

  // (D) after both settle, no resumable snapshot exists: the clear, requested after the write started, still executed after it and therefore won.
  assert.equal(await readCreationSession('user-1', storage), null);
});

test('write/clear ordering: a new write intentionally started after a clear still persists normally', async () => {
  const storage = inMemoryStorage();
  await write('user-1', { ...emptyFields(), goal: 'Old goal' }, '/create/goal', storage);
  const cleared = await clearCreationSession('user-1', storage);
  assert.equal(cleared, true);
  assert.equal(await readCreationSession('user-1', storage), null);

  const wroteAfterClear = await write('user-1', { ...emptyFields(), goal: 'New goal' }, '/create/type', storage);
  assert.equal(wroteAfterClear, true);
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored?.fields.goal, 'New goal', 'a legitimate new write after a clear must not be blocked or lost');
});

test('write/clear ordering: mutations for different users are independent — one user\'s slow write never blocks another user\'s write or clear', async () => {
  const store = new Map<string, string>();
  const userAGate = deferred<void>();
  const storage: CreationSessionStorage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      if (key.endsWith(':user-a')) await userAGate.promise;
      store.set(key, value);
    },
    removeItem: async (key) => { store.delete(key); },
  };

  const slowWriteA = write('user-a', { ...emptyFields(), goal: 'A' }, '/create/goal', storage);
  const fastWriteB = await write('user-b', { ...emptyFields(), goal: 'B' }, '/create/goal', storage);
  assert.equal(fastWriteB, true, 'user-b\'s write must complete without waiting on user-a\'s still-pending write');
  assert.equal((await readCreationSession('user-b', storage))?.fields.goal, 'B');

  userAGate.resolve();
  assert.equal(await slowWriteA, true);
  assert.equal((await readCreationSession('user-a', storage))?.fields.goal, 'A');
});

test('write/clear ordering: a failing clear is reported honestly rather than throwing an unhandled rejection', async () => {
  const storage: CreationSessionStorage = {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => { throw new Error('storage unavailable'); },
  };
  const cleared = await clearCreationSession('user-1', storage);
  assert.equal(cleared, false);
});

// The queue above orders operations that have already been *called* — but
// a debounced autosave timer that has not fired yet has not called
// writeCreationSession at all, so it isn't in the queue when a conversion
// or discard closes the lifecycle. This is exactly the scenario the
// generation barrier exists for: (A) an old write is already running and
// held open, (B) a second, logically-scheduled old-session write has only
// captured its generation token so far — writeCreationSession has not
// been called for it yet, exactly like a still-pending setTimeout — (C)
// conversion/discard closes the lifecycle and clears, (D) only *then* does
// the delayed write actually attempt to run, (E) everything settles, (F)
// no resumable snapshot exists.
test('lifecycle: a write only "scheduled" (generation captured, but writeCreationSession not yet called) before conversion must not resurrect the session after the conversion clear', async () => {
  const userId = 'user-lifecycle-1';
  const store = new Map<string, string>();
  const writeAGate = deferred<void>();
  let writeAStarted = false;
  const storage: CreationSessionStorage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      writeAStarted = true;
      await writeAGate.promise;
      store.set(key, value);
    },
    removeItem: async (key) => { store.delete(key); },
  };

  // A: write A starts and is deliberately held open — already inside storage.setItem.
  const writeAPromise = writeCreationSession(userId, { ...emptyFields(), goal: 'A' }, '/create/goal', storage, currentCreationSessionGeneration(userId));
  await Promise.resolve().then(() => Promise.resolve());
  assert.equal(writeAStarted, true, 'write A must genuinely be in flight');

  // B: a second, old-session write is only scheduled — exactly what autosave does the instant it arms its 500ms debounce timer: capture the generation now, call writeCreationSession only once the timer actually fires.
  const staleGenerationForWriteB = currentCreationSessionGeneration(userId);

  // C: conversion (or discard) closes this creation lifecycle and clears the persisted session — write A is allowed to finish; the clear, queued after it, still wins.
  closeCreationSessionGeneration(userId);
  const clearPromise = clearCreationSession(userId, storage);
  writeAGate.resolve();
  await Promise.all([writeAPromise, clearPromise]);

  // D: only now — well after conversion — does write B's debounce timer actually fire and call writeCreationSession, using the generation it captured back in step B, which is now stale.
  const writeBResult = await writeCreationSession(userId, { ...emptyFields(), goal: 'B (stale, must be dropped)' }, '/create/type', storage, staleGenerationForWriteB);
  assert.equal(writeBResult, true, 'a stale-generation write is treated as a no-op, not a failure');

  // E/F: after everything settles, no resumable snapshot exists — the delayed old-session write must not have resurrected it.
  assert.equal(await readCreationSession(userId, storage), null);
});

test('lifecycle: a genuinely new creation flow started after conversion/discard captures the new generation and persists normally', async () => {
  const userId = 'user-lifecycle-2';
  const storage = inMemoryStorage();

  // G: an old lifecycle closes (conversion or discard).
  closeCreationSessionGeneration(userId);

  // H: a brand new creation flow starts afterward — a freshly-mounted screen captures whatever generation is current *now*, which already reflects the close above, and writes under it normally.
  const freshGeneration = currentCreationSessionGeneration(userId);
  const ok = await writeCreationSession(userId, { ...emptyFields(), goal: 'Fresh challenge' }, '/create/goal', storage, freshGeneration);
  assert.equal(ok, true);
  const restored = await readCreationSession(userId, storage);
  assert.equal(restored?.fields.goal, 'Fresh challenge');
});

test('lifecycle: closing a generation twice (e.g. a failed discard retried) still lets a subsequent fresh write through', async () => {
  const userId = 'user-lifecycle-3';
  const storage = inMemoryStorage();
  closeCreationSessionGeneration(userId);
  closeCreationSessionGeneration(userId);
  const ok = await writeCreationSession(userId, { ...emptyFields(), goal: 'After retried close' }, '/create/goal', storage, currentCreationSessionGeneration(userId));
  assert.equal(ok, true);
  assert.equal((await readCreationSession(userId, storage))?.fields.goal, 'After retried close');
});

test('readCreationSession discards and returns null for unparsable stored data (corrupt snapshot)', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({ [key]: 'not json at all {' });
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null, 'corrupt data must be actively removed, not just ignored');
});

test('readCreationSession discards and returns null for a wrong-shaped or wrong-version payload', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({ [key]: JSON.stringify({ schemaVersion: 999, lastRoute: '/create/goal', fields: {} }) });
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null);
});

function corruptSnapshotWith(fields: unknown): Record<string, string> {
  const key = creationSessionStorageKey('user-1');
  return { [key]: JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), lastRoute: '/create/goal', fields }) };
}

test('a same-version snapshot with completely empty fields ({}) is treated as corrupt, not as a valid blank session', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage(corruptSnapshotWith({}));
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null, 'must be actively removed so it cannot fail the same way again later');
});

test('a same-version snapshot with a malformed rhythm (invalid type, bad weekday) is rejected', async () => {
  const storage1 = inMemoryStorage(corruptSnapshotWith({
    ...emptyFields(), goal: 'Sleep better', rhythm: { ...emptyFields().rhythm, type: 'not-a-real-rhythm-type' },
  }));
  assert.equal(await readCreationSession('user-1', storage1), null);

  const storage2 = inMemoryStorage(corruptSnapshotWith({
    ...emptyFields(), goal: 'Sleep better', rhythm: { ...emptyFields().rhythm, selectedWeekdays: ['funday'] },
  }));
  assert.equal(await readCreationSession('user-1', storage2), null);

  const storage3 = inMemoryStorage(corruptSnapshotWith({
    ...emptyFields(), goal: 'Sleep better', rhythm: 'not even an object',
  }));
  assert.equal(await readCreationSession('user-1', storage3), null);
});

test('a same-version snapshot with malformed recipients is rejected', async () => {
  const missingName = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), recipients: [{ id: 'r-1' }] }));
  assert.equal(await readCreationSession('user-1', missingName), null);

  const notAnArray = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), recipients: 'Mom' }));
  assert.equal(await readCreationSession('user-1', notAnArray), null);

  const emptyId = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), recipients: [{ id: '', name: 'Mom' }] }));
  assert.equal(await readCreationSession('user-1', emptyId), null);
});

test('a same-version snapshot with an invalid enum value is rejected', async () => {
  const badDirection = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), behaviorDirection: 'sideways' }));
  assert.equal(await readCreationSession('user-1', badDirection), null);

  const badCategory = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), experienceCategory: 'bogus' }));
  assert.equal(await readCreationSession('user-1', badCategory), null);

  const badMembership = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), membershipChoice: 'yearly_trial' }));
  assert.equal(await readCreationSession('user-1', badMembership), null);
});

test('a same-version snapshot with a malformed reward organizer is rejected', async () => {
  const missingRecipientId = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), rewardOrganizer: { type: 'recipient' } }));
  assert.equal(await readCreationSession('user-1', missingRecipientId), null);

  const unknownType = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), rewardOrganizer: { type: 'mystery' } }));
  assert.equal(await readCreationSession('user-1', unknownType), null);
});

test('a same-version snapshot with a wrong-typed stake amount or duration (e.g. a string instead of a number) is rejected', async () => {
  const stringStake = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), stakeAmount: '100' }));
  assert.equal(await readCreationSession('user-1', stringStake), null);

  const stringDuration = inMemoryStorage(corruptSnapshotWith({ ...emptyFields(), durationWeeks: '6' }));
  assert.equal(await readCreationSession('user-1', stringDuration), null);
});

test('a genuinely valid snapshot with a populated reward organizer and recipients still passes validation', async () => {
  const storage = inMemoryStorage(corruptSnapshotWith({
    ...emptyFields(),
    goal: 'Sleep better',
    recipients: [{ id: 'recipient-a', name: 'Mom' }],
    rewardOrganizer: { type: 'recipient', recipientId: 'recipient-a' },
  }));
  const session = await readCreationSession('user-1', storage);
  assert.ok(session, 'a well-formed snapshot must still be accepted');
  assert.equal(session.fields.goal, 'Sleep better');
});

test('resolveResumeRoute: restores exactly the last logical step when it is a valid creation route', () => {
  for (const route of RESUMABLE_CREATION_ROUTES) {
    assert.equal(resolveResumeRoute(route), route);
  }
});

test('resolveResumeRoute: falls back to the first real step for intro, share, or garbage input', () => {
  assert.equal(resolveResumeRoute('/create/intro'), '/create/goal');
  assert.equal(resolveResumeRoute('/create/share'), '/create/goal');
  assert.equal(resolveResumeRoute('not-a-route-at-all'), '/create/goal');
  assert.equal(resolveResumeRoute(''), '/create/goal');
});

test('decideCreateChallengeEntryAction: pending commitment always wins over a resumable local session', () => {
  assert.equal(decideCreateChallengeEntryAction(true, true), 'open_pending_commitment');
  assert.equal(decideCreateChallengeEntryAction(true, false), 'open_pending_commitment');
});

test('decideCreateChallengeEntryAction: a resumable session prompts resume when there is no pending commitment', () => {
  assert.equal(decideCreateChallengeEntryAction(false, true), 'prompt_resume');
});

test('decideCreateChallengeEntryAction: neither present starts a completely fresh creation', () => {
  assert.equal(decideCreateChallengeEntryAction(false, false), 'start_fresh');
});

test('planExitAttempt: no meaningful progress always leaves immediately, signed in or not', () => {
  assert.equal(planExitAttempt(false, true), 'leave_immediately');
  assert.equal(planExitAttempt(false, false), 'leave_immediately');
});

test('planExitAttempt: meaningful progress while signed out must never attempt a save — it can never actually persist, so it gets its own honest confirmation', () => {
  assert.equal(planExitAttempt(true, false), 'confirm_unsaved_signed_out');
});

test('planExitAttempt: meaningful progress while signed in attempts a real save', () => {
  assert.equal(planExitAttempt(true, true), 'attempt_save');
});

test('the complete ChallengeDraft boundary is not weakened: a genuinely partial creation-session snapshot still fails mapOnboardingDraft', () => {
  const fields = { ...emptyFields(), goal: 'Sleep better' };
  assert.equal(hasMeaningfulCreationProgress(fields), true, 'sanity check: this is exactly the kind of partial state autosave would persist');

  const asDraftInput: OnboardingDraftData = {
    goal: fields.goal,
    behaviorText: fields.behaviorText,
    definitionText: fields.definitionText,
    behaviorDirection: fields.behaviorDirection,
    measurementMode: fields.measurementMode,
    rhythm: fields.rhythm,
    durationWeeks: fields.durationWeeks,
    recipients: fields.recipients,
    rewardOrganizer: fields.rewardOrganizer,
    experienceCategory: fields.experienceCategory,
    stakeAmount: fields.stakeAmount,
    currency: 'USD',
    sitOutAcknowledged: fields.sitOutAcknowledged,
    invitationMessage: fields.invitationMessage,
    membershipChoice: fields.membershipChoice,
  };
  const result = mapOnboardingDraft(asDraftInput, {
    draftId: 'draft-1' as never,
    ownerId: 'owner-1' as never,
    recipientIds: {},
  });
  assert.equal(result.ok, false, 'a partial local session must never be accepted as a complete server draft');
});

test('createLatestRequestGuard: the first started request is current until a second one starts', () => {
  const guard = createLatestRequestGuard();
  const first = guard.start();
  assert.equal(guard.isCurrent(first), true);
});

test('createLatestRequestGuard: starting a new request immediately invalidates every earlier one — this is exactly what prevents a stale async user-A read from overwriting user-B state', () => {
  const guard = createLatestRequestGuard();
  const first = guard.start();
  const second = guard.start();
  assert.equal(guard.isCurrent(first), false, 'the superseded request must no longer be current, even though it has not "resolved" yet');
  assert.equal(guard.isCurrent(second), true);
});

test('createLatestRequestGuard: only the most recently started token is ever current across many starts', () => {
  const guard = createLatestRequestGuard();
  const tokens = Array.from({ length: 5 }, () => guard.start());
  tokens.slice(0, -1).forEach((token) => assert.equal(guard.isCurrent(token), false));
  assert.equal(guard.isCurrent(tokens.at(-1)!), true);
});

test('createLatestRequestGuard: an unknown token (never started) is never current', () => {
  const guard = createLatestRequestGuard();
  guard.start();
  assert.equal(guard.isCurrent(999), false);
});
