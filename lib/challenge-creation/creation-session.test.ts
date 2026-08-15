import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecipientDraft } from '../../contexts/onboarding-context';
import { mapOnboardingDraft, OnboardingDraftData } from '../../domain/challenge/from-onboarding-draft';

import {
  clearCreationSession,
  createLatestRequestGuard,
  CreationSessionFields,
  CreationSessionStorage,
  creationSessionStorageKey,
  decideCreateChallengeEntryAction,
  hasMeaningfulCreationProgress,
  readCreationSession,
  resolveResumeRoute,
  RESUMABLE_CREATION_ROUTES,
  writeCreationSession,
} from './creation-session';

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
  const ok = await writeCreationSession('user-1', fields, '/create/frequency', storage);
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
  const ok = await writeCreationSession('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.equal(ok, false);
});

test('readCreationSession returns null when nothing has ever been saved for that user', async () => {
  const storage = inMemoryStorage();
  assert.equal(await readCreationSession('nobody', storage), null);
});

test('user isolation: one signed-in user can never read another signed-in user\'s session', async () => {
  const storage = inMemoryStorage();
  await writeCreationSession('user-a', { ...emptyFields(), goal: 'User A\'s goal' }, '/create/goal', storage);
  await writeCreationSession('user-b', { ...emptyFields(), goal: 'User B\'s goal' }, '/create/goal', storage);

  const forA = await readCreationSession('user-a', storage);
  const forB = await readCreationSession('user-b', storage);
  assert.equal(forA?.fields.goal, 'User A\'s goal');
  assert.equal(forB?.fields.goal, 'User B\'s goal');
  assert.notEqual(creationSessionStorageKey('user-a'), creationSessionStorageKey('user-b'));
});

test('explicit discard: clearCreationSession removes the session so it is no longer readable', async () => {
  const storage = inMemoryStorage();
  await writeCreationSession('user-1', { ...emptyFields(), goal: 'Sleep better' }, '/create/goal', storage);
  assert.ok(await readCreationSession('user-1', storage));
  await clearCreationSession('user-1', storage);
  assert.equal(await readCreationSession('user-1', storage), null);
});

test('clearCreationSession on a user with no session is a safe no-op', async () => {
  const storage = inMemoryStorage();
  await assert.doesNotReject(clearCreationSession('user-1', storage));
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
