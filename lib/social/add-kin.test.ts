import assert from 'node:assert/strict';
import test from 'node:test';

import { KinId, KinProfile } from '@/domain/social/types';
import { KinDirectoryEntry, lookupUsername } from './add-kin';

const profile = (username: string, overrides: Partial<KinProfile> = {}): KinProfile => ({
  id: `kin-${username}` as KinId,
  username,
  displayName: username,
  initials: username.slice(0, 2).toUpperCase(),
  relationshipNote: 'Fixture',
  ...overrides,
});

const directory: readonly KinDirectoryEntry[] = [
  { profile: profile('sam_k'), status: null },
  { profile: profile('mia.rowan'), status: 'approved' },
  { profile: profile('theo_b'), status: 'pending_incoming' },
  { profile: profile('nora_p'), status: 'pending_outgoing' },
];

test('an exact match with no existing relationship is an eligible new Kin', () => {
  const outcome = lookupUsername('sam_k', directory);
  assert.equal(outcome.kind, 'exact_match');
});

test('username matching is case-insensitive', () => {
  const outcome = lookupUsername('SAM_K', directory);
  assert.equal(outcome.kind, 'exact_match');
});

test('an already-approved Kin is reported as already Kin, not an eligible match', () => {
  const outcome = lookupUsername('mia.rowan', directory);
  assert.equal(outcome.kind, 'already_kin');
});

test('an incoming pending request is reported as already pending', () => {
  const outcome = lookupUsername('theo_b', directory);
  assert.equal(outcome.kind, 'request_pending');
});

test('an outgoing pending request is reported as already pending', () => {
  const outcome = lookupUsername('nora_p', directory);
  assert.equal(outcome.kind, 'request_pending');
});

test('no matching username yields no_match, never a suggestion', () => {
  const outcome = lookupUsername('nobody_here', directory);
  assert.equal(outcome.kind, 'no_match');
  assert.equal(outcome.kind === 'no_match' && outcome.queriedUsername, 'nobody_here');
});

test('an empty or whitespace-only query yields no_match without searching', () => {
  const outcome = lookupUsername('   ', directory);
  assert.equal(outcome.kind, 'no_match');
});
