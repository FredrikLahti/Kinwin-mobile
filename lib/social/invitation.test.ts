import assert from 'node:assert/strict';
import test from 'node:test';

import { KinId, KinProfile } from '@/domain/social/types';
import { chooseOnlyMeIntent, hasSocialVisibility, kinHasAccess, lockAudience } from './challenge-audience';
import { acceptInvitation, createInvitation } from './invitation';

const fredrik: KinProfile = {
  id: 'onboarding-kin-fredrik' as KinId,
  username: 'fredrik_l',
  displayName: 'Fredrik',
  initials: 'FL',
  relationshipNote: 'Invited you to Kinwin',
};

test('accepting an invitation adds the inviter to approved Kin', () => {
  const approved = acceptInvitation([], fredrik);
  assert.equal(approved.length, 1);
  assert.equal(approved[0].id, fredrik.id);
});

test('accepting an invitation from someone already Kin does not duplicate them', () => {
  const once = acceptInvitation([], fredrik);
  const twice = acceptInvitation(once, fredrik);
  assert.equal(twice.length, 1);
});

test('invitation acceptance creates Kinship but grants no challenge access', () => {
  const approved = acceptInvitation([], fredrik);
  assert.equal(approved.length, 1);

  // A freshly accepted Kinship exists, but the default "Only me" audience,
  // locked or not, never grants access to anyone.
  const locked = lockAudience(chooseOnlyMeIntent(), approved.map((kin) => kin.id));
  assert.equal(hasSocialVisibility(locked), false);
  assert.equal(kinHasAccess(locked, fredrik.id), false);

  // An unlocked (null) audience — i.e. before any explicit lock — behaves
  // the same way, regardless of who is now Kin.
  assert.equal(kinHasAccess(null, fredrik.id), false);
});

test('an invitation record alone (without acceptance) grants no challenge access', () => {
  const invitation = createInvitation('You');
  assert.ok(invitation.link.length > 0);
  assert.equal(kinHasAccess(null, fredrik.id), false);
});
