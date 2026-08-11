import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlaybookCreateInput } from './create-entry';

test('challenge handoff carries the valid source challenge into creation', () => {
  assert.equal(buildPlaybookCreateInput({ ownerId: 'owner', category: 'lesson', content: 'Prepare earlier.', sourceChallengeId: 'challenge' }).sourceChallengeId, 'challenge');
});

test('ordinary manual Playbook creation remains unlinked', () => {
  assert.equal(buildPlaybookCreateInput({ ownerId: 'owner', category: 'support', content: 'Ask for help.' }).sourceChallengeId, null);
});
