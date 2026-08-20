import assert from 'node:assert/strict';
import test from 'node:test';

import { mapOnboardingDraft, OnboardingDraftData } from './from-onboarding-draft';
import { applyResolvedRecipientIds, resolveRecipientIds } from './recipient-ids';
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
  successThresholdOverride: null,
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

// Success Means: a stricter-than-baseline selection round-trips as
// ruleVersion 2, and restoreOnboardingDraftData reads back the exact
// persisted minimum (never re-deriving or weakening it) — see
// docs/PRODUCT_DECISIONS.md.
test('Build (daily) with a stricter Success Means selection round-trips as ruleVersion 2', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    successThresholdOverride: 27,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.equal(first.successRule.direction === 'build' && first.successRule.ruleVersion, 2);
  assert.equal(first.successRule.direction === 'build' && first.successRule.minimumRequiredCompletions, 27);
  assert.equal(first.successRule.direction === 'build' && first.successRule.totalPlannedCompletions, 28);
  assert.equal(restored.successThresholdOverride, 27, 'restore must read back the exact persisted minimum, not the baseline');
});

test('Cut back (day) with a stricter Success Means selection round-trips as ruleVersion 2', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Screen time',
    behaviorDirection: 'cut',
    measurementMode: 'time',
    rhythm: { type: 'maximum_per_period', period: 'day', targetValue: '120', selectedWeekdays: [], timeUnit: 'minutes', amountUnit: '' },
    durationWeeks: 4,
    successThresholdOverride: 27,
  };
  const { first, second, restored } = roundTrip(data);
  assert.deepEqual(second, first);
  assert.equal(first.successRule.direction === 'cut_back' && first.successRule.ruleVersion, 2);
  assert.equal(first.successRule.direction === 'cut_back' && first.successRule.minimumPeriodsWithinLimit, 27);
  assert.equal(restored.successThresholdOverride, 27);
});

test('A Success Means selection equal to the baseline maps back to ruleVersion 1, not a redundant V2', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    successThresholdOverride: 25, // the true baseline for 4 weeks daily (28 total, allowed shortfall 3)
  };
  const mapped = mapOnboardingDraft(data, metadata);
  assert.equal(mapped.ok, true);
  if (!mapped.ok) throw new Error('unreachable');
  assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.ruleVersion, 1);
});

// mapOnboardingDraft is a client-side convenience boundary, not the trusted
// one — see supabase/migrations/20260906000000_success_means_v2.sql, which
// independently re-derives and HARD-REJECTS an out-of-bounds value with no
// clamping, for exactly the case where this layer is bypassed entirely
// (a payload crafted directly against challenge_drafts). This layer's own
// job (via deriveStructuredSuccessRule → clampSuccessThreshold) is to
// never let ordinary, legitimately-stale onboarding state produce an
// invalid draft — a below-baseline value is clamped UP to the baseline,
// never rejected, and can therefore never end up weaker than V1.
test('A below-baseline Success Means selection is clamped up to the baseline, never left weaker or rejected', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    successThresholdOverride: 10, // below the true baseline of 25
  };
  const mapped = mapOnboardingDraft(data, metadata);
  assert.equal(mapped.ok, true);
  if (!mapped.ok) throw new Error('unreachable');
  assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.ruleVersion, 1);
  assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.minimumRequiredCompletions, 25);
});

test('An above-total Success Means selection is clamped down to the total, never rejected', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    successThresholdOverride: 999, // above the total of 28
  };
  const mapped = mapOnboardingDraft(data, metadata);
  assert.equal(mapped.ok, true);
  if (!mapped.ok) throw new Error('unreachable');
  assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.ruleVersion, 2);
  assert.equal(mapped.value.successRule.direction === 'build' && mapped.value.successRule.minimumRequiredCompletions, 28);
});

// True multi-currency V1 (domain/challenge/currency.ts): USD/SEK/EUR are
// all genuinely supported commitment currencies; anything else is rejected
// with 'unsupported_currency', never silently coerced to USD.
for (const currency of ['USD', 'SEK', 'EUR']) {
  test(`Build (daily) round-trips unchanged with ${currency} as the stake currency`, () => {
    const data: OnboardingDraftData = {
      ...baseFields,
      behaviorText: 'Strength train',
      behaviorDirection: 'build',
      measurementMode: 'completion',
      rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
      durationWeeks: 4,
      currency,
    };
    const { first, second, restored } = roundTrip(data);
    assert.deepEqual(second, first);
    assert.equal(first.stake.currency, currency);
    assert.equal(restored.currency, currency);
  });
}

test('an unsupported currency is rejected with unsupported_currency, not silently coerced to USD', () => {
  const data: OnboardingDraftData = {
    ...baseFields,
    behaviorText: 'Strength train',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
    currency: 'GBP',
  };
  const mapped = mapOnboardingDraft(data, metadata);
  assert.equal(mapped.ok, false);
  if (mapped.ok) throw new Error('unreachable');
  assert.ok(mapped.issues.some((issue) => issue.code === 'unsupported_currency'));
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

test('applyResolvedRecipientIds replaces ephemeral ids and keeps names', () => {
  const recipients = [{ id: 'recipient-1', name: 'Anna' }, { id: 'recipient-2', name: 'Bob' }];
  const recipientIds = { 'recipient-1': '11111111-1111-4111-8111-111111111111', 'recipient-2': '22222222-2222-4222-8222-222222222222' };
  const { recipients: next } = applyResolvedRecipientIds(recipients, null, recipientIds);
  assert.deepEqual(next, [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Anna' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Bob' },
  ]);
});

test('applyResolvedRecipientIds remaps a reward organizer pointing at a replaced recipient', () => {
  const recipients = [{ id: 'recipient-1', name: 'Anna' }];
  const recipientIds = { 'recipient-1': '11111111-1111-4111-8111-111111111111' };
  const { rewardOrganizer } = applyResolvedRecipientIds(
    recipients,
    { type: 'recipient', recipientId: 'recipient-1' },
    recipientIds,
  );
  assert.deepEqual(rewardOrganizer, { type: 'recipient', recipientId: '11111111-1111-4111-8111-111111111111' });
});

test('applyResolvedRecipientIds leaves an "other" reward organizer untouched', () => {
  const recipients = [{ id: 'recipient-1', name: 'Anna' }];
  const recipientIds = { 'recipient-1': '11111111-1111-4111-8111-111111111111' };
  const { rewardOrganizer } = applyResolvedRecipientIds(
    recipients,
    { type: 'other', name: 'A neighbor' },
    recipientIds,
  );
  assert.deepEqual(rewardOrganizer, { type: 'other', name: 'A neighbor' });
});

test('a second save after applying resolved ids reuses them and mints nothing new', () => {
  // Models the exact bug from review: recipient ids start ephemeral, the
  // first save mints stable UUIDs, and the caller (activate.tsx) is
  // expected to persist those back into onboarding state via
  // applyResolvedRecipientIds — so a second save of the same draft must see
  // UUID-shaped ids already and mint nothing new.
  const original = [{ id: 'recipient-1730000000-a1', name: 'Anna' }, { id: 'recipient-1730000000-b2', name: 'Bob' }];
  let minted = 0;
  const firstSaveIds = resolveRecipientIds(original, () => { minted += 1; return `4444444${minted}-4444-4444-8444-444444444444`; });
  assert.equal(minted, 2, 'both ephemeral ids should be minted on first save');

  const { recipients: persisted } = applyResolvedRecipientIds(original, null, firstSaveIds);

  const throwingMint = () => { throw new Error('mintId should not be called once ids are already stable'); };
  const secondSaveIds = resolveRecipientIds(persisted, throwingMint);
  assert.deepEqual(secondSaveIds, {
    [persisted[0].id]: persisted[0].id,
    [persisted[1].id]: persisted[1].id,
  });
});
