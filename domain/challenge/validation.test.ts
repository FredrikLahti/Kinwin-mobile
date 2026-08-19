import assert from 'node:assert/strict';
import test from 'node:test';

import { isSupportedCurrency, SUPPORTED_CURRENCIES } from './currency';
import { mapOnboardingDraft, OnboardingDraftData } from './from-onboarding-draft';
import { validateActivationReadiness } from './validation';
import type { ChallengeDraft, ChallengeDraftId, RecipientId, UserId } from './types';

const PRODUCTION_RECIPIENT_ID = '11111111-1111-4111-8111-111111111111';

const metadata = {
  draftId: 'draft-1' as ChallengeDraftId,
  ownerId: 'owner-1' as UserId,
  recipientIds: { 'recipient-a': PRODUCTION_RECIPIENT_ID as RecipientId } as Record<string, RecipientId>,
};

const buildFixture: OnboardingDraftData = {
  goal: 'Sleep better',
  behaviorText: 'Strength train',
  definitionText: 'Complete the planned session',
  behaviorDirection: 'build',
  measurementMode: 'completion',
  rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
  durationWeeks: 4, // total 28, V1 baseline 25
  recipients: [{ id: 'recipient-a', name: 'Anna' }],
  rewardOrganizer: { type: 'recipient', recipientId: 'recipient-a' },
  experienceCategory: 'dinner',
  stakeAmount: 75,
  currency: 'USD',
  sitOutAcknowledged: true,
  invitationMessage: 'Join me in this promise.',
  membershipChoice: 'monthly_trial',
  successThresholdOverride: null,
};

const limitFixture: OnboardingDraftData = {
  ...buildFixture,
  behaviorText: 'Screen time',
  behaviorDirection: 'cut',
  measurementMode: 'time',
  rhythm: { type: 'maximum_per_period', period: 'day', targetValue: '120', selectedWeekdays: [], timeUnit: 'minutes', amountUnit: '' },
};

const stopFixture: OnboardingDraftData = {
  ...buildFixture,
  behaviorText: 'Smoking',
  behaviorDirection: 'stop',
  measurementMode: 'abstinence',
  rhythm: { type: 'continuous', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
};

function draftFor(data: OnboardingDraftData): ChallengeDraft {
  const mapped = mapOnboardingDraft(data, metadata);
  assert.equal(mapped.ok, true, 'fixture must map to a valid draft');
  if (!mapped.ok) throw new Error('unreachable');
  return mapped.value;
}

test('V1 backward compatibility: an exact-baseline build draft has no successRule issues', () => {
  const draft = draftFor(buildFixture);
  assert.equal(draft.successRule.direction === 'build' && draft.successRule.ruleVersion, 1);
  const issues = validateActivationReadiness(draft);
  assert.equal(issues.some((issue) => issue.field.startsWith('successRule')), false);
});

test('V2 build lower bound: a selection below Kinwin\'s baseline can never be saved as a valid draft', () => {
  const draft = draftFor(buildFixture);
  assert.equal(draft.successRule.direction === 'build' && draft.successRule.minimumRequiredCompletions, 25, 'sanity check on the true baseline');
  const weakened: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'build'
      ? { ...draft.successRule, ruleVersion: 2, minimumRequiredCompletions: 10 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(weakened);
  assert.ok(issues.some((issue) => issue.field === 'successRule'), 'a below-baseline V2 selection must be rejected');
});

test('V2 build upper bound: a selection above the total can never be saved as a valid draft', () => {
  const draft = draftFor(buildFixture);
  const overshot: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'build'
      ? { ...draft.successRule, ruleVersion: 2, minimumRequiredCompletions: 999 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(overshot);
  assert.ok(issues.some((issue) => issue.field === 'successRule'), 'an above-total V2 selection must be rejected');
});

test('V2 build within bounds is accepted, and every other derived field stays untouched from the baseline', () => {
  const draft = draftFor(buildFixture);
  const stricter: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'build'
      ? { ...draft.successRule, ruleVersion: 2, minimumRequiredCompletions: 27 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(stricter);
  assert.equal(issues.some((issue) => issue.field.startsWith('successRule')), false);
});

test('V2 Limit lower bound: a selection below Kinwin\'s baseline can never be saved as a valid draft', () => {
  const draft = draftFor(limitFixture);
  assert.equal(draft.successRule.direction === 'cut_back' && draft.successRule.minimumPeriodsWithinLimit, 25, 'sanity check on the true baseline');
  const weakened: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'cut_back'
      ? { ...draft.successRule, ruleVersion: 2, minimumPeriodsWithinLimit: 10 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(weakened);
  assert.ok(issues.some((issue) => issue.field === 'successRule'));
});

test('V2 Limit upper bound: a selection above the total can never be saved as a valid draft', () => {
  const draft = draftFor(limitFixture);
  const overshot: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'cut_back'
      ? { ...draft.successRule, ruleVersion: 2, minimumPeriodsWithinLimit: 999 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(overshot);
  assert.ok(issues.some((issue) => issue.field === 'successRule'));
});

test('V2 Limit within bounds is accepted', () => {
  const draft = draftFor(limitFixture);
  const stricter: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'cut_back'
      ? { ...draft.successRule, ruleVersion: 2, minimumPeriodsWithinLimit: 27 }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(stricter);
  assert.equal(issues.some((issue) => issue.field.startsWith('successRule')), false);
});

test('Avoid remains strict zero-lapse: a V2 stop successRule is always rejected — there is no adjustable threshold', () => {
  const draft = draftFor(stopFixture);
  assert.equal(draft.successRule.direction === 'stop' && draft.successRule.lapseRule.type, 'zero_lapses');
  const forcedV2 = {
    ...draft,
    successRule: { ...draft.successRule, ruleVersion: 2 },
  } as unknown as ChallengeDraft;
  const issues = validateActivationReadiness(forcedV2);
  assert.ok(issues.some((issue) => issue.field === 'successRule'), 'stop must never accept ruleVersion 2, however it is constructed');
});

// True multi-currency V1 (domain/challenge/currency.ts): the ONE canonical
// USD/SEK/EUR contract every layer imports — no duplicated currency sets.
test('SUPPORTED_CURRENCIES is exactly USD/SEK/EUR', () => {
  assert.deepEqual([...SUPPORTED_CURRENCIES].sort(), ['EUR', 'SEK', 'USD']);
});

test('isSupportedCurrency accepts exactly USD/SEK/EUR and rejects everything else', () => {
  assert.equal(isSupportedCurrency('USD'), true);
  assert.equal(isSupportedCurrency('SEK'), true);
  assert.equal(isSupportedCurrency('EUR'), true);
  assert.equal(isSupportedCurrency('GBP'), false);
  assert.equal(isSupportedCurrency('usd'), false, 'not case-insensitive — the persisted value must already be an exact canonical code');
  assert.equal(isSupportedCurrency(''), false);
});

for (const currency of ['USD', 'SEK', 'EUR']) {
  test(`validateActivationReadiness raises no stake.currency issue for a ${currency}-denominated draft`, () => {
    const draft = draftFor({ ...buildFixture, currency });
    const issues = validateActivationReadiness(draft);
    assert.equal(issues.some((issue) => issue.field === 'stake.currency'), false);
  });
}

test('validateActivationReadiness rejects a draft whose stake currency is not in SUPPORTED_CURRENCIES', () => {
  const draft = draftFor(buildFixture);
  const tampered: ChallengeDraft = { ...draft, stake: { ...draft.stake, currency: 'GBP' as ChallengeDraft['stake']['currency'] } };
  const issues = validateActivationReadiness(tampered);
  assert.ok(issues.some((issue) => issue.field === 'stake.currency' && issue.code === 'unsupported'));
});

test('continuity safeguard is unchanged by a V2 selection: swapping its type alongside a valid threshold still fails validation', () => {
  const draft = draftFor(buildFixture);
  const tamperedSafeguard: ChallengeDraft = {
    ...draft,
    successRule: draft.successRule.direction === 'build'
      ? { ...draft.successRule, ruleVersion: 2, minimumRequiredCompletions: 27, continuitySafeguard: { type: 'minimum_completions_per_week', minimum: 1 } }
      : draft.successRule,
  };
  const issues = validateActivationReadiness(tamperedSafeguard);
  assert.ok(issues.some((issue) => issue.field === 'successRule'), 'the continuity safeguard must stay exactly the baseline\'s — V2 only widens the overall threshold');
});
