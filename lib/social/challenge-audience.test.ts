import assert from 'node:assert/strict';
import test from 'node:test';

import { KinId } from '@/domain/social/types';
import { createInvitation } from './invitation';
import {
  chooseAllKin,
  chooseOnlyMe,
  chooseSelectedKin,
  hasSocialVisibility,
  kinHasAccess,
} from './challenge-audience';

const ALEX = 'kin-alex' as KinId;
const PRIYA = 'kin-priya' as KinId;
const LATER_KIN = 'kin-later' as KinId;

test('"Only me" works with zero Kin and grants no one access', () => {
  const audience = chooseOnlyMe();
  assert.equal(hasSocialVisibility(audience), false);
  assert.equal(kinHasAccess(audience, ALEX), false);
});

test('"Selected Kin" with zero selections produces no social visibility', () => {
  const audience = chooseSelectedKin([]);
  assert.equal(hasSocialVisibility(audience), false);
});

test('"Selected Kin" grants access only to the chosen people', () => {
  const audience = chooseSelectedKin([ALEX]);
  assert.equal(hasSocialVisibility(audience), true);
  assert.equal(kinHasAccess(audience, ALEX), true);
  assert.equal(kinHasAccess(audience, PRIYA), false);
});

test('"All my Kin" snapshots current approved Kin — a later-accepted Kin gets no retroactive access', () => {
  const audience = chooseAllKin([ALEX, PRIYA]);
  assert.equal(kinHasAccess(audience, ALEX), true);
  assert.equal(kinHasAccess(audience, PRIYA), true);
  // LATER_KIN is accepted after the snapshot was taken — the snapshot never grows.
  assert.equal(kinHasAccess(audience, LATER_KIN), false);
});

test('removing a Kin after audience selection does not retroactively erase their historical access', () => {
  const audience = chooseAllKin([ALEX, PRIYA]);
  // Simulates Alex being removed from My Kin afterward — the prototype does
  // not invent a policy that strips already-granted historical access.
  assert.equal(kinHasAccess(audience, ALEX), true);
});

test('an invitation record alone grants no challenge access to anyone', () => {
  const invitation = createInvitation('You');
  const audience = chooseOnlyMe();
  assert.ok(invitation.link.length > 0);
  assert.equal(kinHasAccess(audience, ALEX), false);
});
