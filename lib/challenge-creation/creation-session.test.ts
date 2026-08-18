import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecipientDraft } from '../../contexts/onboarding-context';
import { mapOnboardingDraft, OnboardingDraftData } from '../../domain/challenge/from-onboarding-draft';

import {
  clearCreationSession,
  closeCreationSessionGeneration,
  createLatestRequestGuard,
  CREATION_SESSION_SCHEMA_VERSION,
  CreationSessionCheckpoint,
  CreationSessionFields,
  CreationSessionStorage,
  creationSessionStorageKey,
  currentCreationSessionGeneration,
  decideCreateChallengeEntryAction,
  hasMeaningfulCreationProgress,
  isResumeEligibleSession,
  planBackLeaveAttempt,
  planExitAttempt,
  readCreationSession,
  resolveResumeRoute,
  RESUMABLE_CREATION_ROUTES,
  saveCreationSessionCheckpoint,
  writeCreationSessionWorking,
} from './creation-session';

// Most tests below aren't exercising the generation/lifecycle mechanism at
// all, so they just capture "whatever generation is current right now" —
// exactly what a real background-autosave caller does for a normal,
// non-stale write. checkpoint defaults to null: no explicit Save & exit
// has happened yet for the session being simulated.
function writeWorking(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  storage: CreationSessionStorage,
  checkpoint: CreationSessionCheckpoint | null = null,
) {
  return writeCreationSessionWorking(userId, fields, lastRoute, checkpoint, storage, currentCreationSessionGeneration(userId));
}

// Mirrors what hooks/use-creation-session-autosave.ts's saveCheckpoint()
// does: capture "now" once and use it for both the storage write and
// (there, separately) the in-memory checkpoint mirror.
function saveCheckpoint(
  userId: string,
  fields: CreationSessionFields,
  lastRoute: string,
  storage: CreationSessionStorage,
  savedAt: string = new Date().toISOString(),
) {
  return saveCreationSessionCheckpoint(userId, fields, lastRoute, savedAt, storage, currentCreationSessionGeneration(userId));
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
    successThresholdOverride: null,
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

test('writeCreationSessionWorking then readCreationSession round-trips working, and preserves whatever checkpoint was passed through unchanged', async () => {
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
  const checkpoint: CreationSessionCheckpoint = { fields: { ...emptyFields(), goal: 'Earlier checkpoint' }, lastRoute: '/create/type', savedAt: '2026-01-01T00:00:00.000Z' };
  const ok = await writeWorking('user-1', fields, '/create/frequency', storage, checkpoint);
  assert.equal(ok, true, 'a successful write must report success');
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored);
  assert.ok(restored.working);
  assert.equal(restored.working.lastRoute, '/create/frequency');
  assert.deepEqual(restored.working.fields, fields);
  assert.deepEqual(restored.checkpoint, checkpoint, 'a background working write must carry the checkpoint through completely unchanged');
});

test('writeCreationSessionWorking honestly reports failure when the underlying storage write throws', async () => {
  const storage: CreationSessionStorage = {
    getItem: async () => null,
    setItem: async () => { throw new Error('disk full'); },
    removeItem: async () => undefined,
  };
  const ok = await writeWorking('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.equal(ok, false);
});

test('saveCreationSessionCheckpoint sets both working and checkpoint to the same latest fields, and reports failure honestly on a storage error', async () => {
  const storage = inMemoryStorage();
  const fields: CreationSessionFields = { ...emptyFields(), goal: 'Ready to pause here' };
  const ok = await saveCheckpoint('user-1', fields, '/create/frequency', storage, '2026-02-02T00:00:00.000Z');
  assert.equal(ok, true, 'a successful checkpoint save must report success');
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored?.working);
  assert.ok(restored.checkpoint);
  assert.deepEqual(restored.working.fields, fields);
  assert.deepEqual(restored.checkpoint.fields, fields);
  assert.equal(restored.checkpoint.lastRoute, '/create/frequency');
  assert.equal(restored.checkpoint.savedAt, '2026-02-02T00:00:00.000Z');

  const failingStorage: CreationSessionStorage = {
    getItem: async () => null,
    setItem: async () => { throw new Error('disk full'); },
    removeItem: async () => undefined,
  };
  const failed = await saveCheckpoint('user-2', fields, '/create/goal', failingStorage);
  assert.equal(failed, false, '"your progress is saved" must never be promised on a false premise');
});

test('readCreationSession returns null when nothing has ever been saved for that user', async () => {
  const storage = inMemoryStorage();
  assert.equal(await readCreationSession('nobody', storage), null);
});

test('user isolation: one signed-in user can never read another signed-in user\'s session', async () => {
  const storage = inMemoryStorage();
  await writeWorking('user-a', { ...emptyFields(), goal: 'User A\'s goal' }, '/create/goal', storage);
  await writeWorking('user-b', { ...emptyFields(), goal: 'User B\'s goal' }, '/create/goal', storage);

  const forA = await readCreationSession('user-a', storage);
  const forB = await readCreationSession('user-b', storage);
  assert.equal(forA?.working?.fields.goal, 'User A\'s goal');
  assert.equal(forB?.working?.fields.goal, 'User B\'s goal');
  assert.notEqual(creationSessionStorageKey('user-a'), creationSessionStorageKey('user-b'));
});

test('explicit discard: clearCreationSession removes the whole session (working and checkpoint alike) so it is no longer readable', async () => {
  const storage = inMemoryStorage();
  await saveCheckpoint('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.ok(await readCreationSession('user-1', storage));
  await clearCreationSession('user-1', storage);
  assert.equal(await readCreationSession('user-1', storage), null);
});

test('clearCreationSession on a user with no session is a safe no-op', async () => {
  const storage = inMemoryStorage();
  await assert.doesNotReject(clearCreationSession('user-1', storage));
});

// --- v3 -> v4 migration (Success Means added successThresholdOverride) ---
//
// v3 sessions predate the successThresholdOverride field entirely; they
// are stored under a *different* key (kinwin:creation-session:v3:<userId>)
// than v4 sessions (…v4:<userId>) — see creationSessionStorageKey. A
// legitimate, already-persisted v3 Save & exit / crash-recovery session
// must survive the v3->v4 upgrade, not be silently treated as corrupt and
// discarded just because this one additive field didn't exist yet.

const V3_FIELDS = {
  behaviorDirection: 'build' as const,
  behaviorText: 'Strength train',
  definitionText: 'Complete the planned session',
  durationWeeks: 4,
  experienceCategory: 'dinner' as const,
  goal: 'Sleep better',
  invitationMessage: 'Join me in this promise.',
  invitationMessageCustomized: true,
  membershipChoice: 'monthly_trial' as const,
  measurementMode: 'completion' as const,
  recipients: [{ id: 'recipient-a', name: 'Anna' }],
  rewardOrganizer: { type: 'recipient' as const, recipientId: 'recipient-a' },
  rhythm: { amountUnit: '', period: 'day' as const, selectedWeekdays: [], targetValue: '', timeUnit: null, type: 'daily' as const },
  sitOutAcknowledged: true,
  stakeAmount: 75,
  stakeAmountInput: '75',
  // Deliberately no successThresholdOverride — this is exactly the shape
  // a real pre-Success-Means installation would have persisted.
};

function v3Key(userId: string): string {
  return `kinwin:creation-session:v3:${userId}`;
}

function v3Snapshot(lastRoute: string) {
  return {
    schemaVersion: 3,
    working: { fields: V3_FIELDS, lastRoute, updatedAt: '2026-01-01T00:00:00.000Z' },
    checkpoint: { fields: V3_FIELDS, lastRoute, savedAt: '2026-01-01T00:00:00.000Z' },
  };
}

test('v3->v4 migration: a valid v3 checkpoint/working session survives and every existing field is retained', async () => {
  const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3Snapshot('/create/frequency')) });
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored, 'a legitimate v3 session must not be silently discarded');
  assert.equal(restored.schemaVersion, CREATION_SESSION_SCHEMA_VERSION);
  assert.ok(restored.working);
  assert.ok(restored.checkpoint);
  for (const [key, value] of Object.entries(V3_FIELDS)) {
    assert.deepEqual((restored.working!.fields as unknown as Record<string, unknown>)[key], value, `working.fields.${key} must be retained unchanged`);
    assert.deepEqual((restored.checkpoint!.fields as unknown as Record<string, unknown>)[key], value, `checkpoint.fields.${key} must be retained unchanged`);
  }
});

test('v3->v4 migration: successThresholdOverride becomes null (Kinwin\'s baseline), never invented', async () => {
  const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3Snapshot('/create/frequency')) });
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored?.working?.fields.successThresholdOverride, null);
  assert.equal(restored?.checkpoint?.fields.successThresholdOverride, null);
});

for (const oldRoute of ['/create/recipients', '/create/consequence', '/create/review']) {
  test(`v3->v4 migration: a session formerly at ${oldRoute} (at/after the old Duration boundary) resumes at success-means instead of skipping the new step`, async () => {
    const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3Snapshot(oldRoute)) });
    const restored = await readCreationSession('user-1', storage);
    assert.equal(restored?.working?.lastRoute, '/create/success-means');
    assert.equal(restored?.checkpoint?.lastRoute, '/create/success-means');
  });
}

for (const earlyRoute of ['/create/goal', '/create/type', '/create/build', '/create/frequency', '/create/duration']) {
  test(`v3->v4 migration: a session at ${earlyRoute} (before the old Duration boundary) keeps its route unchanged`, async () => {
    const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3Snapshot(earlyRoute)) });
    const restored = await readCreationSession('user-1', storage);
    assert.equal(restored?.working?.lastRoute, earlyRoute);
    assert.equal(restored?.checkpoint?.lastRoute, earlyRoute);
  });
}

test('v3->v4 migration: the migrated session is persisted under the v4 key and the v3 key is retired, so v3 is never re-read', async () => {
  const seed: Record<string, string> = { [v3Key('user-1')]: JSON.stringify(v3Snapshot('/create/duration')) };
  const storage = inMemoryStorage(seed);
  const first = await readCreationSession('user-1', storage);
  assert.ok(first);

  const v3StillThere = await storage.getItem(v3Key('user-1'));
  assert.equal(v3StillThere, null, 'the legacy v3 entry must be removed once migrated');

  const v4StillThere = await storage.getItem(creationSessionStorageKey('user-1'));
  assert.ok(v4StillThere, 'the migrated session must be persisted under the canonical v4 key');

  // A second read must not depend on the v3 key existing at all anymore.
  const second = await readCreationSession('user-1', storage);
  assert.deepEqual(second, first);
});

test('v3->v4 migration: genuinely malformed v3 data is rejected and removed, exactly like malformed v4 data', async () => {
  const malformed = { schemaVersion: 3, working: { fields: {}, lastRoute: '/create/goal', updatedAt: '2026-01-01T00:00:00.000Z' }, checkpoint: null };
  const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(malformed) });
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored, null);
  assert.equal(await storage.getItem(v3Key('user-1')), null, 'malformed v3 data must be proactively removed, not left to fail again later');
});

test('v3->v4 migration: unparseable v3 JSON is rejected and removed', async () => {
  const storage = inMemoryStorage({ [v3Key('user-1')]: 'not valid json{{{' });
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored, null);
  assert.equal(await storage.getItem(v3Key('user-1')), null);
});

test('v3->v4 migration: a v3-only working session with no checkpoint migrates the working half alone', async () => {
  const v3WorkingOnly = { schemaVersion: 3, working: { fields: V3_FIELDS, lastRoute: '/create/duration', updatedAt: '2026-01-01T00:00:00.000Z' }, checkpoint: null };
  const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3WorkingOnly) });
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored?.working);
  assert.equal(restored.checkpoint, null);
  assert.equal(restored.working.fields.successThresholdOverride, null);
});

test('native v4 sessions are read directly and never consult (or need) a v3 fallback', async () => {
  const storage = inMemoryStorage();
  const fields: CreationSessionFields = { ...emptyFields(), goal: 'Native v4 session', successThresholdOverride: 27 };
  await writeWorking('user-1', fields, '/create/success-means', storage);
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored?.working);
  assert.deepEqual(restored.working.fields, fields);
  assert.equal(restored.working.lastRoute, '/create/success-means');
  assert.equal(await storage.getItem(v3Key('user-1')), null, 'a native v4 write must never touch the legacy v3 key');
});

test('v4 takes priority: if both a v4 session and a leftover v3 key exist for the same user, the v4 one wins and v3 is left untouched', async () => {
  const storage = inMemoryStorage({ [v3Key('user-1')]: JSON.stringify(v3Snapshot('/create/recipients')) });
  await writeWorking('user-1', { ...emptyFields(), goal: 'Real v4 progress' }, '/create/duration', storage);
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored?.working?.fields.goal, 'Real v4 progress');
  assert.equal(restored?.working?.lastRoute, '/create/duration', 'must not be route-migrated — this is a real v4 session, not a migrated v3 one');
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

  const writePromise = writeWorking('user-1', { ...emptyFields(), goal: 'Old goal' }, '/create/goal', storage);
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
  await writeWorking('user-1', { ...emptyFields(), goal: 'Old goal' }, '/create/goal', storage);
  const cleared = await clearCreationSession('user-1', storage);
  assert.equal(cleared, true);
  assert.equal(await readCreationSession('user-1', storage), null);

  const wroteAfterClear = await writeWorking('user-1', { ...emptyFields(), goal: 'New goal' }, '/create/type', storage);
  assert.equal(wroteAfterClear, true);
  const restored = await readCreationSession('user-1', storage);
  assert.equal(restored?.working?.fields.goal, 'New goal', 'a legitimate new write after a clear must not be blocked or lost');
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

  const slowWriteA = writeWorking('user-a', { ...emptyFields(), goal: 'A' }, '/create/goal', storage);
  const fastWriteB = await writeWorking('user-b', { ...emptyFields(), goal: 'B' }, '/create/goal', storage);
  assert.equal(fastWriteB, true, 'user-b\'s write must complete without waiting on user-a\'s still-pending write');
  assert.equal((await readCreationSession('user-b', storage))?.working?.fields.goal, 'B');

  userAGate.resolve();
  assert.equal(await slowWriteA, true);
  assert.equal((await readCreationSession('user-a', storage))?.working?.fields.goal, 'A');
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
// writeCreationSessionWorking at all, so it isn't in the queue when a
// conversion or discard closes the lifecycle. This is exactly the
// scenario the generation barrier exists for: (A) an old write is already
// running and held open, (B) a second, logically-scheduled old-session
// write has only captured its generation token so far —
// writeCreationSessionWorking has not been called for it yet, exactly
// like a still-pending setTimeout — (C) conversion/discard closes the
// lifecycle and clears, (D) only *then* does the delayed write actually
// attempt to run, (E) everything settles, (F) no resumable snapshot
// exists.
test('lifecycle: a write only "scheduled" (generation captured, but writeCreationSessionWorking not yet called) before conversion must not resurrect the session after the conversion clear', async () => {
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
  const writeAPromise = writeCreationSessionWorking(userId, { ...emptyFields(), goal: 'A' }, '/create/goal', null, storage, currentCreationSessionGeneration(userId));
  await Promise.resolve().then(() => Promise.resolve());
  assert.equal(writeAStarted, true, 'write A must genuinely be in flight');

  // B: a second, old-session write is only scheduled — exactly what autosave does the instant it arms its 500ms debounce timer: capture the generation now, call writeCreationSessionWorking only once the timer actually fires.
  const staleGenerationForWriteB = currentCreationSessionGeneration(userId);

  // C: conversion (or discard) closes this creation lifecycle and clears the persisted session — write A is allowed to finish; the clear, queued after it, still wins.
  closeCreationSessionGeneration(userId);
  const clearPromise = clearCreationSession(userId, storage);
  writeAGate.resolve();
  await Promise.all([writeAPromise, clearPromise]);

  // D: only now — well after conversion — does write B's debounce timer actually fire and call writeCreationSessionWorking, using the generation it captured back in step B, which is now stale.
  const writeBResult = await writeCreationSessionWorking(userId, { ...emptyFields(), goal: 'B (stale, must be dropped)' }, '/create/type', null, storage, staleGenerationForWriteB);
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
  const ok = await writeCreationSessionWorking(userId, { ...emptyFields(), goal: 'Fresh challenge' }, '/create/goal', null, storage, freshGeneration);
  assert.equal(ok, true);
  const restored = await readCreationSession(userId, storage);
  assert.equal(restored?.working?.fields.goal, 'Fresh challenge');
});

test('lifecycle: closing a generation twice (e.g. a failed discard retried) still lets a subsequent fresh write through', async () => {
  const userId = 'user-lifecycle-3';
  const storage = inMemoryStorage();
  closeCreationSessionGeneration(userId);
  closeCreationSessionGeneration(userId);
  const ok = await writeCreationSessionWorking(userId, { ...emptyFields(), goal: 'After retried close' }, '/create/goal', null, storage, currentCreationSessionGeneration(userId));
  assert.equal(ok, true);
  assert.equal((await readCreationSession(userId, storage))?.working?.fields.goal, 'After retried close');
});

// --- Explicit checkpoint model (Back / Save & exit) ----------------------

test('1. fresh work protected only by background autosave never creates an explicit checkpoint, so it is not resume-eligible', async () => {
  const storage = inMemoryStorage();
  await writeWorking('user-1', { ...emptyFields(), goal: 'Still typing' }, '/create/goal', storage, null);
  const restored = await readCreationSession('user-1', storage);
  assert.ok(restored?.working, 'the working crash-recovery state is still persisted');
  assert.equal(restored?.checkpoint, null, 'no explicit checkpoint exists yet');
  assert.equal(isResumeEligibleSession(restored), false, 'Home must never offer "Continue challenge" for a session that only exists from background autosave');
});

test('2. Save & exit at state A creates an explicit checkpoint A', async () => {
  const storage = inMemoryStorage();
  const fieldsA = { ...emptyFields(), goal: 'A' };
  const ok = await saveCheckpoint('user-1', fieldsA, '/create/goal', storage);
  assert.equal(ok, true);
  const restored = await readCreationSession('user-1', storage);
  assert.deepEqual(restored?.checkpoint?.fields, fieldsA);
  assert.equal(isResumeEligibleSession(restored), true);
});

test('3. Continue A, edit to B via background autosave only, then leaving without Save & exit: the checkpoint stays A, not B', async () => {
  const storage = inMemoryStorage();
  const fieldsA = { ...emptyFields(), goal: 'A' };
  await saveCheckpoint('user-1', fieldsA, '/create/goal', storage);
  const afterCheckpointA = await readCreationSession('user-1', storage);
  assert.ok(afterCheckpointA?.checkpoint);

  // "Continue A -> edit to B": background autosave fires while editing,
  // carrying the existing checkpoint (A) through completely unchanged —
  // exactly what hooks/use-creation-session-autosave.ts does every time,
  // using onboarding.checkpoint as-is rather than re-deriving it.
  const fieldsB = { ...emptyFields(), goal: 'B' };
  await writeWorking('user-1', fieldsB, '/create/type', storage, afterCheckpointA.checkpoint);

  const restored = await readCreationSession('user-1', storage);
  assert.deepEqual(restored?.working?.fields, fieldsB, 'the working crash-recovery state does reflect the newer edit B');
  assert.deepEqual(restored?.checkpoint?.fields, fieldsA, 'but the explicit checkpoint must still be A — Continue must never silently promote an unsaved edit');
});

test('4. Continue A, edit to B, then explicit Save & exit: the checkpoint becomes B', async () => {
  const storage = inMemoryStorage();
  const fieldsA = { ...emptyFields(), goal: 'A' };
  await saveCheckpoint('user-1', fieldsA, '/create/goal', storage);

  const fieldsB = { ...emptyFields(), goal: 'B' };
  const ok = await saveCheckpoint('user-1', fieldsB, '/create/type', storage);
  assert.equal(ok, true);

  const restored = await readCreationSession('user-1', storage);
  assert.deepEqual(restored?.checkpoint?.fields, fieldsB, 'an explicit Save & exit always overwrites the checkpoint with the latest fields');
});

test('5. abandoned unsaved work with no prior checkpoint leaves no resumable session once cleared', async () => {
  const userId = 'user-abandon-fresh';
  const storage = inMemoryStorage();
  await writeWorking(userId, { ...emptyFields(), goal: 'Half-finished' }, '/create/goal', storage, null);
  const beforeLeaving = await readCreationSession(userId, storage);
  assert.equal(isResumeEligibleSession(beforeLeaving), false, 'sanity check: never explicitly saved, so not eligible even before leaving');

  // A debounce timer armed a moment before "Leave without saving" was confirmed.
  const staleGeneration = currentCreationSessionGeneration(userId);

  closeCreationSessionGeneration(userId);
  const cleared = await clearCreationSession(userId, storage);
  assert.equal(cleared, true);

  const staleWrite = await writeCreationSessionWorking(userId, { ...emptyFields(), goal: 'stale edit' }, '/create/goal', null, storage, staleGeneration);
  assert.equal(staleWrite, true, 'a stale-generation write is a no-op, not a failure');
  assert.equal(await readCreationSession(userId, storage), null, 'nothing must be left behind for Home to ever offer as resumable');
});

test('6. explicit discard removes both working and an existing checkpoint', async () => {
  const userId = 'user-discard-with-checkpoint';
  const storage = inMemoryStorage();
  await saveCheckpoint(userId, { ...emptyFields(), goal: 'Saved earlier' }, '/create/goal', storage);
  assert.ok((await readCreationSession(userId, storage))?.checkpoint);

  closeCreationSessionGeneration(userId);
  const cleared = await clearCreationSession(userId, storage);
  assert.equal(cleared, true);
  assert.equal(await readCreationSession(userId, storage), null, 'explicit discard destroys the checkpoint too, not just working state');
});

test('7. server conversion removes both working and an existing checkpoint, identically to explicit discard', async () => {
  const userId = 'user-convert-with-checkpoint';
  const storage = inMemoryStorage();
  await saveCheckpoint(userId, { ...emptyFields(), goal: 'Saved earlier' }, '/create/goal', storage);
  assert.ok((await readCreationSession(userId, storage))?.checkpoint);

  // app/create/review.tsx's runPrepare does exactly this on a successful
  // prepareChallengeFromDraft: close the generation, then clear.
  closeCreationSessionGeneration(userId);
  const cleared = await clearCreationSession(userId, storage);
  assert.equal(cleared, true);
  assert.equal(await readCreationSession(userId, storage), null);
});

test('8. a stale delayed background write after abandon/discard/conversion cannot resurrect working or checkpoint, even for a session that had already been explicitly saved for later', async () => {
  const userId = 'user-discard-eligible';
  const store = new Map<string, string>();
  const writeGate = deferred<void>();
  let writeStarted = false;
  // Only the *second* write (the delayed one below) is meant to hang on
  // the gate — an initial ungated write establishes the already-eligible
  // session first, exactly like a real earlier Save & exit.
  let gateWrites = false;
  const storage: CreationSessionStorage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      if (gateWrites) {
        writeStarted = true;
        await writeGate.promise;
      }
      store.set(key, value);
    },
    removeItem: async (key) => { store.delete(key); },
  };

  await saveCheckpoint(userId, { ...emptyFields(), goal: 'Saved earlier' }, '/create/goal', storage);
  const afterCheckpoint = await readCreationSession(userId, storage);
  assert.ok(afterCheckpoint?.checkpoint, 'sanity check: this session was explicitly saved before the delayed edit below');

  gateWrites = true;
  const generation = currentCreationSessionGeneration(userId);
  const delayedWrite = writeCreationSessionWorking(
    userId,
    { ...emptyFields(), goal: 'edited again, still eligible' },
    '/create/type',
    afterCheckpoint.checkpoint,
    storage,
    generation,
  );
  await Promise.resolve().then(() => Promise.resolve());
  assert.equal(writeStarted, true, 'the delayed write must genuinely be in flight before discard is requested');

  closeCreationSessionGeneration(userId);
  const discardCleared = clearCreationSession(userId, storage);
  writeGate.resolve();
  await Promise.all([delayedWrite, discardCleared]);

  assert.equal(await readCreationSession(userId, storage), null, 'explicit discard must still win even over an already-eligible, in-flight working write');
});

test('isResumeEligibleSession: no session at all is never eligible', () => {
  assert.equal(isResumeEligibleSession(null), false);
});

test('planBackLeaveAttempt: no meaningful progress and no checkpoint never needs confirmation', () => {
  assert.equal(planBackLeaveAttempt(emptyFields(), null), 'proceed');
});

test('planBackLeaveAttempt: meaningful progress with no checkpoint at all requires confirmation before leaving', () => {
  assert.equal(planBackLeaveAttempt({ ...emptyFields(), goal: 'Sleep better' }, null), 'confirm_leave_without_saving');
});

test('planBackLeaveAttempt: current fields identical to an existing checkpoint need no confirmation — Continue would restore the exact same state either way', () => {
  const fields = { ...emptyFields(), goal: 'Saved goal' };
  assert.equal(planBackLeaveAttempt(fields, fields), 'proceed');
  // A structurally-equal but distinct object must be treated the same as identical — this is a content comparison, not a reference comparison.
  assert.equal(planBackLeaveAttempt({ ...fields }, { ...fields }), 'proceed');
});

test('planBackLeaveAttempt: current fields that diverge from an existing checkpoint require confirmation — this is the core "Continue A, edit to B" scenario', () => {
  const checkpointA = { ...emptyFields(), goal: 'A' };
  const editedB = { ...emptyFields(), goal: 'B' };
  assert.equal(planBackLeaveAttempt(editedB, checkpointA), 'confirm_leave_without_saving');
});

test('readCreationSession discards and returns null for unparsable stored data (corrupt snapshot)', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({ [key]: 'not json at all {' });
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null, 'corrupt data must be actively removed, not just ignored');
});

test('readCreationSession discards and returns null for a wrong-shaped or wrong-version payload', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({ [key]: JSON.stringify({ schemaVersion: 999, working: null, checkpoint: null }) });
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null);
});

// Schema migration safety: bumping CREATION_SESSION_SCHEMA_VERSION changes
// creationSessionStorageKey's output, so an old-version snapshot is simply
// never read under the new key — orphaned, not reinterpreted. This proves
// that even if an old-shaped payload (e.g. a v2 payload with the old flat
// savedForLater boolean) somehow ended up under the *current* key (the
// only way readCreationSession would ever see it directly), it is still
// safely rejected rather than treated as carrying a v3 checkpoint it never
// actually recorded.
test('a snapshot one schema version behind the current one (the old flat savedForLater shape) is treated as no session, never reinterpreted as an explicit checkpoint', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({
    [key]: JSON.stringify({
      schemaVersion: CREATION_SESSION_SCHEMA_VERSION - 1,
      updatedAt: new Date().toISOString(),
      lastRoute: '/create/goal',
      savedForLater: true,
      fields: emptyFields(),
    }),
  });
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null, 'a version-mismatched payload must be actively discarded, not left to be misread again');
});

test('creationSessionStorageKey changes when the schema version changes, so an old-version snapshot is naturally orphaned rather than ever read under the new key', () => {
  assert.equal(creationSessionStorageKey('user-1'), `kinwin:creation-session:v${CREATION_SESSION_SCHEMA_VERSION}:user-1`);
});

test('a same-version snapshot missing the working/checkpoint keys entirely is rejected, not defaulted to an empty session', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage({
    [key]: JSON.stringify({ schemaVersion: CREATION_SESSION_SCHEMA_VERSION }),
  });
  assert.equal(await readCreationSession('user-1', storage), null);
});

function snapshotWith(working: unknown, checkpoint: unknown): Record<string, string> {
  const key = creationSessionStorageKey('user-1');
  return {
    [key]: JSON.stringify({ schemaVersion: CREATION_SESSION_SCHEMA_VERSION, working, checkpoint }),
  };
}

function malformedFieldsSnapshot(fields: unknown): Record<string, string> {
  return snapshotWith({ lastRoute: '/create/goal', updatedAt: new Date().toISOString(), fields }, null);
}

test('a same-version snapshot with completely empty working fields ({}) is treated as corrupt, not as a valid blank session', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage(malformedFieldsSnapshot({}));
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null, 'must be actively removed so it cannot fail the same way again later');
});

test('a same-version snapshot with a malformed working rhythm (invalid type, bad weekday) is rejected', async () => {
  const storage1 = inMemoryStorage(malformedFieldsSnapshot({
    ...emptyFields(), goal: 'Sleep better', rhythm: { ...emptyFields().rhythm, type: 'not-a-real-rhythm-type' },
  }));
  assert.equal(await readCreationSession('user-1', storage1), null);

  const storage2 = inMemoryStorage(malformedFieldsSnapshot({
    ...emptyFields(), goal: 'Sleep better', rhythm: { ...emptyFields().rhythm, selectedWeekdays: ['funday'] },
  }));
  assert.equal(await readCreationSession('user-1', storage2), null);

  const storage3 = inMemoryStorage(malformedFieldsSnapshot({
    ...emptyFields(), goal: 'Sleep better', rhythm: 'not even an object',
  }));
  assert.equal(await readCreationSession('user-1', storage3), null);
});

test('a same-version snapshot with malformed working recipients is rejected', async () => {
  const missingName = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), recipients: [{ id: 'r-1' }] }));
  assert.equal(await readCreationSession('user-1', missingName), null);

  const notAnArray = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), recipients: 'Mom' }));
  assert.equal(await readCreationSession('user-1', notAnArray), null);

  const emptyId = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), recipients: [{ id: '', name: 'Mom' }] }));
  assert.equal(await readCreationSession('user-1', emptyId), null);
});

test('a same-version snapshot with an invalid working enum value is rejected', async () => {
  const badDirection = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), behaviorDirection: 'sideways' }));
  assert.equal(await readCreationSession('user-1', badDirection), null);

  const badCategory = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), experienceCategory: 'bogus' }));
  assert.equal(await readCreationSession('user-1', badCategory), null);

  const badMembership = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), membershipChoice: 'yearly_trial' }));
  assert.equal(await readCreationSession('user-1', badMembership), null);
});

test('a same-version snapshot with a malformed working reward organizer is rejected', async () => {
  const missingRecipientId = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), rewardOrganizer: { type: 'recipient' } }));
  assert.equal(await readCreationSession('user-1', missingRecipientId), null);

  const unknownType = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), rewardOrganizer: { type: 'mystery' } }));
  assert.equal(await readCreationSession('user-1', unknownType), null);
});

test('a same-version snapshot with a wrong-typed working stake amount or duration (e.g. a string instead of a number) is rejected', async () => {
  const stringStake = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), stakeAmount: '100' }));
  assert.equal(await readCreationSession('user-1', stringStake), null);

  const stringDuration = inMemoryStorage(malformedFieldsSnapshot({ ...emptyFields(), durationWeeks: '6' }));
  assert.equal(await readCreationSession('user-1', stringDuration), null);
});

test('a malformed checkpoint (missing savedAt) is rejected even when working is perfectly valid', async () => {
  const key = creationSessionStorageKey('user-1');
  const storage = inMemoryStorage(snapshotWith(
    { lastRoute: '/create/goal', updatedAt: new Date().toISOString(), fields: emptyFields() },
    { lastRoute: '/create/goal', fields: emptyFields() }, // missing savedAt
  ));
  assert.equal(await readCreationSession('user-1', storage), null);
  assert.equal(await storage.getItem(key), null);
});

test('a genuinely valid snapshot with a populated reward organizer, recipients, and an explicit checkpoint still passes validation', async () => {
  const validFields = {
    ...emptyFields(),
    goal: 'Sleep better',
    recipients: [{ id: 'recipient-a', name: 'Mom' }],
    rewardOrganizer: { type: 'recipient' as const, recipientId: 'recipient-a' },
  };
  const storage = inMemoryStorage(snapshotWith(
    { lastRoute: '/create/goal', updatedAt: new Date().toISOString(), fields: validFields },
    { lastRoute: '/create/goal', savedAt: new Date().toISOString(), fields: validFields },
  ));
  const session = await readCreationSession('user-1', storage);
  assert.ok(session, 'a well-formed snapshot must still be accepted');
  assert.equal(session.working?.fields.goal, 'Sleep better');
  assert.equal(session.checkpoint?.fields.goal, 'Sleep better');
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
    successThresholdOverride: fields.successThresholdOverride,
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
