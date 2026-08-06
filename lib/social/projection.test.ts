import assert from 'node:assert/strict';
import test from 'node:test';

import { KinId, PrivateChallengeFixture, SocialChallengeId } from '@/domain/social/types';
import { projectSocialChallenge } from './projection';

const OWNER = 'owner-1' as KinId;
const VIEWER = 'viewer-1' as KinId;
const OTHER_KIN = 'other-1' as KinId;

const baseChallenge = (overrides: Partial<PrivateChallengeFixture> = {}): PrivateChallengeFixture => ({
  id: 'challenge-1' as SocialChallengeId,
  ownerId: OWNER,
  ownerDisplayName: 'Alex',
  exactTitle: 'No added sugar for 30 days',
  exactDescription: 'Cutting all added sugar for 30 days straight.',
  generalTitle: 'A month of cutting something out',
  generalDescription: "Working on cutting out a habit that's been hard to shake.",
  startedLabel: 'Day 1',
  plannedEndLabel: 'Day 30',
  behaviorProgress: { current: 22, target: 30, unit: 'days sugar-free' },
  dayProgress: { daysElapsed: 22, totalDays: 30 },
  consequenceSummary: 'Mom and Jonas split a spa afternoon if Alex misses more than 2 days.',
  recipientNames: ['Mom', 'Jonas'],
  audience: 'all_kin',
  detailLevel: 'exact',
  selectedKinIds: [],
  lifecycle: [
    {
      id: 'evt-1',
      kind: 'challenge_started',
      dayLabel: 'Day 1',
      exactHeadline: 'Alex started: 30 days with no added sugar.',
      generalHeadline: 'Alex started a 30-day challenge.',
    },
  ],
  ...overrides,
});

test('an "only me" challenge is never visible to any Kin viewer', () => {
  const challenge = baseChallenge({ audience: 'only_me' });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.equal(projection, null);
});

test('a non-approved-Kin viewer gets no access regardless of audience', () => {
  const challenge = baseChallenge({ audience: 'all_kin' });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: false });
  assert.equal(projection, null);
});

test('"selected Kin" only grants access to viewers on the list', () => {
  const challenge = baseChallenge({ audience: 'selected_kin', selectedKinIds: [OTHER_KIN] });
  const excluded = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.equal(excluded, null);

  const included = projectSocialChallenge(challenge, { id: OTHER_KIN, isApprovedKin: true });
  assert.notEqual(included, null);
});

test('exact detail shows the real title, description, and recipients', () => {
  const challenge = baseChallenge({ detailLevel: 'exact' });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.equal(projection?.title, challenge.exactTitle);
  assert.equal(projection?.description, challenge.exactDescription);
  assert.deepEqual(projection?.recipientNames, challenge.recipientNames);
  assert.equal(projection?.consequenceSummary, challenge.consequenceSummary);
  assert.match(projection?.progressLabel ?? '', /days sugar-free/);
});

test('general detail generalizes the title and description but still shows recipients', () => {
  const challenge = baseChallenge({ detailLevel: 'general' });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.equal(projection?.title, challenge.generalTitle);
  assert.equal(projection?.description, challenge.generalDescription);
  assert.notEqual(projection?.title, challenge.exactTitle);
  assert.deepEqual(projection?.recipientNames, challenge.recipientNames);
});

test('progress-only output contains no exact goal or behavior, and hides recipients', () => {
  const challenge = baseChallenge({ detailLevel: 'progress_only' });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.ok(projection);
  assert.notEqual(projection.title, challenge.exactTitle);
  assert.notEqual(projection.title, challenge.generalTitle);
  assert.notEqual(projection.description, challenge.exactDescription);
  assert.notEqual(projection.description, challenge.generalDescription);
  // Behavior-specific words (the unit of the private measurement) must never leak.
  assert.doesNotMatch(projection.title, /sugar/i);
  assert.doesNotMatch(projection.description, /sugar/i);
  assert.doesNotMatch(projection.progressLabel, /sugar/i);
  // Progress is shown in generic day terms only.
  assert.equal(projection.progressLabel, 'Day 22 of 30');
  assert.equal(projection.recipientNames, null);
  assert.equal(projection.consequenceSummary, null);
});

test('unauthorized recipients never appear when the viewer has no access at all', () => {
  const challenge = baseChallenge({ audience: 'selected_kin', selectedKinIds: [OTHER_KIN] });
  const projection = projectSocialChallenge(challenge, { id: VIEWER, isApprovedKin: true });
  assert.equal(projection, null);
});

test('lifecycle headlines use the exact wording only at exact detail', () => {
  const exact = projectSocialChallenge(baseChallenge({ detailLevel: 'exact' }), { id: VIEWER, isApprovedKin: true });
  const general = projectSocialChallenge(baseChallenge({ detailLevel: 'general' }), { id: VIEWER, isApprovedKin: true });
  assert.equal(exact?.lifecycle[0]?.headline, 'Alex started: 30 days with no added sugar.');
  assert.equal(general?.lifecycle[0]?.headline, 'Alex started a 30-day challenge.');
});
