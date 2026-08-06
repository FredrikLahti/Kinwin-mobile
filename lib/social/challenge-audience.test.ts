import assert from 'node:assert/strict';
import test from 'node:test';

import { KinId, KinProfile } from '@/domain/social/types';
import {
  chooseAllKinIntent,
  chooseOnlyMeIntent,
  chooseSelectedKinIntent,
  hasSocialVisibility,
  kinHasAccess,
  lockAudience,
} from './challenge-audience';
import { removeApprovedKin } from './kinship-requests';

const ALEX = 'kin-alex' as KinId;
const PRIYA = 'kin-priya' as KinId;
const LATER_KIN = 'kin-later' as KinId;

const profile = (id: KinId): KinProfile => ({
  id,
  username: id,
  displayName: id,
  initials: id.slice(0, 2).toUpperCase(),
  relationshipNote: 'Fixture',
});

test('"Only me" is the default and is never socially visible, locked or not', () => {
  const intent = chooseOnlyMeIntent();
  const locked = lockAudience(intent, [ALEX, PRIYA]);
  assert.equal(hasSocialVisibility(locked), false);
  assert.equal(kinHasAccess(locked, ALEX), false);
});

test('choosing "All my Kin" is only an intent — it grants no access before locking', () => {
  // Represented by `lockedAudience` staying `null` in the context until the
  // explicit lock action; the pure functions model that with `null` directly.
  assert.equal(hasSocialVisibility(null), false);
  assert.equal(kinHasAccess(null, ALEX), false);
});

test('locking "All my Kin" freezes the currently approved Kin as a snapshot', () => {
  const intent = chooseAllKinIntent();
  const locked = lockAudience(intent, [ALEX, PRIYA]);
  assert.equal(hasSocialVisibility(locked), true);
  assert.equal(kinHasAccess(locked, ALEX), true);
  assert.equal(kinHasAccess(locked, PRIYA), true);
});

test('a Kin who becomes approved after the lock is not retroactively granted access', () => {
  const intent = chooseAllKinIntent();
  const locked = lockAudience(intent, [ALEX, PRIYA]);
  // LATER_KIN was not approved at lock time — the snapshot never grows.
  assert.equal(kinHasAccess(locked, LATER_KIN), false);
});

test('"Selected Kin" with zero picks stays invisible even after locking', () => {
  const intent = chooseSelectedKinIntent([]);
  const locked = lockAudience(intent, [ALEX, PRIYA]);
  assert.equal(hasSocialVisibility(locked), false);
});

test('"Selected Kin" locks exactly the people picked at lock time, not the full approved list', () => {
  const intent = chooseSelectedKinIntent([ALEX]);
  const locked = lockAudience(intent, [ALEX, PRIYA]);
  assert.equal(kinHasAccess(locked, ALEX), true);
  assert.equal(kinHasAccess(locked, PRIYA), false);
});

test('removing a Kin after the lock does not retroactively change their already-locked access', () => {
  const locked = lockAudience(chooseAllKinIntent(), [ALEX, PRIYA]);

  // Actually removes Alex from the approved-Kin list, the same function the
  // remove-Kin confirmation screen calls.
  const approvedAfterRemoval = removeApprovedKin([profile(ALEX), profile(PRIYA)], ALEX);
  assert.equal(approvedAfterRemoval.some((kin) => kin.id === ALEX), false);

  // Removal only touched the approved-Kin list — the already-locked
  // snapshot (and therefore Alex's access to this specific challenge) is
  // untouched, matching "do not claim immediate removal from an
  // already-active Challenge Room and do not invent historical erasure."
  assert.equal(kinHasAccess(locked, ALEX), true);
});
