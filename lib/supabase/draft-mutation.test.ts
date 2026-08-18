import assert from 'node:assert/strict';
import test from 'node:test';

import { mapOnboardingDraft, OnboardingDraftData } from '../../domain/challenge/from-onboarding-draft';
import type { ChallengeDraftId, RecipientId, UserId } from '../../domain/challenge/types';
import { planDraftMutation } from './draft-mutation';

const PRODUCTION_RECIPIENT_ID = '11111111-1111-4111-8111-111111111111';

function buildDraft() {
  const data: OnboardingDraftData = {
    goal: 'Sleep better',
    behaviorText: 'Strength train',
    definitionText: 'Complete the planned session',
    behaviorDirection: 'build',
    measurementMode: 'completion',
    rhythm: { type: 'daily', period: null, targetValue: '', selectedWeekdays: [], timeUnit: null, amountUnit: '' },
    durationWeeks: 4,
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
  const result = mapOnboardingDraft(data, {
    draftId: 'draft-1' as ChallengeDraftId,
    ownerId: 'owner-1' as UserId,
    recipientIds: { 'recipient-a': PRODUCTION_RECIPIENT_ID as RecipientId },
  });
  assert.equal(result.ok, true, 'expected the fixture to map to a valid draft');
  if (!result.ok) throw new Error('unreachable');
  return result.value;
}

test('planDraftMutation inserts the full row, including id and owner_id, for a new draft', () => {
  const draft = buildDraft();
  const plan = planDraftMutation(null, 'draft-1', 'owner-1', draft);
  assert.equal(plan.kind, 'insert');
  if (plan.kind !== 'insert') throw new Error('unreachable');
  assert.deepEqual(plan.row, {
    id: 'draft-1',
    owner_id: 'owner-1',
    schema_version: 1,
    draft_payload: draft,
    draft_status: 'ready_for_activation',
  });
});

test('planDraftMutation updates only mutable columns for an existing draft, never id or owner_id', () => {
  const draft = buildDraft();
  const plan = planDraftMutation('draft-1', 'draft-1', 'owner-1', draft);
  assert.equal(plan.kind, 'update');
  if (plan.kind !== 'update') throw new Error('unreachable');
  assert.equal(plan.id, 'draft-1');
  assert.deepEqual(plan.row, {
    schema_version: 1,
    draft_payload: draft,
    draft_status: 'ready_for_activation',
  });
  assert.ok(!('id' in plan.row), 'update payload must not include id — authenticated has no update grant on it');
  assert.ok(!('owner_id' in plan.row), 'update payload must not include owner_id — authenticated has no update grant on it');
});
