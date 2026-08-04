import assert from 'node:assert/strict';
import test from 'node:test';

import { mapOnboardingDraft, OnboardingDraftData } from './from-onboarding-draft';
import { resolveRecipientIds } from './recipient-ids';
import { restoreOnboardingDraftData } from './to-onboarding-draft';
import type { ChallengeDraftId, RecipientId, UserId } from './types';

const PRODUCTION_RECIPIENT_ID = '11111111-1111-4111-8111-111111111111';

const metadata = {
  draftId: 'draft-1' as ChallengeDraftId,
  ownerId: 'owner-1' as UserId,
  recipientIds: { 'recipient-a': PRODUCTION_RECIPIENT_ID as RecipientId } as Record<string, RecipientId>,
};

const baseFields = {
  goal: 'Sleep better',
  definitionText: 'Complete the planned session',
  recipients: [{ id: 'recipient-a', name: 'Anna' }],
  rewardOrganizer: { type: 'recipient' as const, recipientId: 'recipient-a' },
  experienceCategory: 'dinner' as const,
  stakeAmount: 75,
  currency: 'USD',
  sitOutAcknowledged: true,
  invitationMessage: 'Join me in this promise.',
  membershipChoice: 'monthly_trial' as const,
};

function roundTrip(data: OnboardingDraftData) {
  const first = mapOnboardingDraft(data, metadata);
  assert.equal(first.ok, true, 'expected the fixture to map to a valid draft');
  if (!first.ok) throw new Error('unreachable');

  // restoreOnboardingDraftData carries the *production* recipient ids
  // forward (see recipient-ids.test coverage below); mapOnboardingDraft's
  // caller is responsible for re-deriving the id map from those, exactly
  // as the real repository does via resolveRecipientIds — an identity
  // mapping here, since every id already looks like a production UUID.
  const restored = restoreOnboardingDraftData(first.value);
  const restoredMetadata = {
    ...metadata,
    recipientIds: resolveRecipientIds(restored.recipients, () => { throw new Error('every restored recipient id should already be stable'); }),
  };
  const second = mapOnboardingDraft(restored, restoredMetadata);
  assert.equal(second.ok, true, 'expected the restored data to still map to a valid draft');
  if (!second.ok) throw new Error('unreachable');

  return { first: first.value, restored, second: second.value };
}

test('Build (daily) round-trips through restoreOnboardingDraftData unchanged', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
  };
  const { first, second } = roundTrip(data);
  assert.deepEqual(second, first);
});

test('Build (specific days) round-trips including weekday selection', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'specific_days', period: null, targetValue: '', selectedWeekdays: ['monday', 'wednesday', 'friday'], timeUnit: null, amountUnit: '' },
    durationWeeks: 6,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.deepEqual(restored.rhythm.selectedWeekdays, ['monday', 'wednesday', 'friday']);
});

test('Cut back (time) round-trips the boundary and unit', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Screen time',
    behaviorDirection: 'cut',
    measurementMode: 'time',
    rhythm: { type: 'maximum_per_period', period: 'day', targetValue: '120', selectedWeekdays: [], timeUnit: 'minutes', amountUnit: '' },
    durationWeeks: 4,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.equal(restored.behaviorDirection, 'cut');
  assert.equal(restored.rhythm.timeUnit, 'minutes');
});

test('Cut back (amount) round-trips a free-text unit', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Vaping',
    behaviorDirection: 'cut',
    measurementMode: 'amount',
    rhythm: { type: 'maximum_per_period', period: 'week', targetValue: '10', selectedWeekdays: [], timeUnit: null, amountUnit: 'puffs' },
    durationWeeks: 4,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.equal(restored.rhythm.amountUnit, 'puffs');
});

test('Stop round-trips to a continuous, zero-lapse rule', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Smoking',
    behaviorDirection: 'stop',
    measurementMode: 'abstinence',
    rhythm: { type: 'continuous', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 2,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.equal(restored.behaviorDirection, 'stop');
  assert.equal(first.successRule.direction === 'stop' && first.successRule.lapseRule.type, 'zero_lapses');
});

test('resolveRecipientIds reuses an already-production id and mints a new one for an ephemeral id', () => {
  const alreadyStable = '11111111-1111-4111-8111-111111111111';
  const ephemeral = 'recipient-1730000000-a1';
  let minted = 0;
  const ids = resolveRecipientIds(
    [{ id: alreadyStable, name: 'Anna' }, { id: ephemeral, name: 'Bob' }],
    () => { minted += 1; return `22222222-2222-4222-8222-22222222222${minted}`; },
  );
  assert.equal(ids[alreadyStable], alreadyStable);
  assert.equal(ids[ephemeral], '22222222-2222-4222-8222-222222222221');
  assert.equal(minted, 1, 'must not mint a new id for a recipient that already has a stable one');
});

test('resolveRecipientIds is stable across repeated calls for already-production ids', () => {
  const stableA = '11111111-1111-4111-8111-111111111111';
  const stableB = '33333333-3333-4333-8333-333333333333';
  const mintId = () => { throw new Error('mintId should not be called for already-stable ids'); };
  const first = resolveRecipientIds([{ id: stableA, name: 'Anna' }, { id: stableB, name: 'Bob' }], mintId);
  const second = resolveRecipientIds([{ id: stableA, name: 'Anna' }, { id: stableB, name: 'Bob' }], mintId);
  assert.deepEqual(first, second);
});
