import assert from 'node:assert/strict';
import test from 'node:test';

import { IncomingKinshipRequest, KinshipRequestId, OutgoingKinshipRequest } from '@/domain/social/onboarding';
import { KinId, KinProfile } from '@/domain/social/types';
import {
  acceptIncomingRequest,
  declineIncomingRequest,
  removeApprovedKin,
  sendOutgoingRequest,
  simulateOutgoingAccepted,
  withdrawOutgoingRequest,
} from './kinship-requests';

const profile = (id: string): KinProfile => ({
  id: id as KinId,
  username: id,
  displayName: id,
  initials: id.slice(0, 2).toUpperCase(),
  relationshipNote: 'Fixture',
});

test('sending an outgoing request adds exactly one pending entry', () => {
  const sam = profile('sam');
  const result = sendOutgoingRequest([], sam);
  assert.equal(result.length, 1);
  assert.equal(result[0].profile.id, sam.id);
});

test('sending a request to someone already requested does not duplicate it', () => {
  const sam = profile('sam');
  const once = sendOutgoingRequest([], sam);
  const twice = sendOutgoingRequest(once, sam);
  assert.equal(twice.length, 1);
});

test('withdrawing an outgoing request removes only that request', () => {
  const sam = profile('sam');
  const nora = profile('nora');
  const sent = sendOutgoingRequest(sendOutgoingRequest([], sam), nora);
  const withdrawn = withdrawOutgoingRequest(sent, sent[0].id);
  assert.equal(withdrawn.length, 1);
  assert.equal(withdrawn[0].profile.id, nora.id);
});

test('accepting an incoming request moves the requester into approved and clears the request', () => {
  const theo = profile('theo');
  const incoming: readonly IncomingKinshipRequest[] = [{ id: 'incoming-theo' as KinshipRequestId, profile: theo }];
  const result = acceptIncomingRequest(incoming, [], 'incoming-theo' as KinshipRequestId);
  assert.equal(result.incoming.length, 0);
  assert.equal(result.approved.length, 1);
  assert.equal(result.approved[0].id, theo.id);
});

test('accepting an incoming request grants no challenge access by itself — it only returns Kin/request lists', () => {
  const theo = profile('theo');
  const incoming: readonly IncomingKinshipRequest[] = [{ id: 'incoming-theo' as KinshipRequestId, profile: theo }];
  const result = acceptIncomingRequest(incoming, [], 'incoming-theo' as KinshipRequestId);
  assert.deepEqual(Object.keys(result).sort(), ['approved', 'incoming']);
});

test('declining an incoming request removes it without adding anyone to approved', () => {
  const theo = profile('theo');
  const incoming: readonly IncomingKinshipRequest[] = [{ id: 'incoming-theo' as KinshipRequestId, profile: theo }];
  const result = declineIncomingRequest(incoming, 'incoming-theo' as KinshipRequestId);
  assert.equal(result.length, 0);
});

test('simulating an outgoing request being accepted moves it straight to approved', () => {
  const sam = profile('sam');
  const outgoing: readonly OutgoingKinshipRequest[] = [{ id: 'outgoing-sam' as KinshipRequestId, profile: sam }];
  const result = simulateOutgoingAccepted(outgoing, [], 'outgoing-sam' as KinshipRequestId);
  assert.equal(result.outgoing.length, 0);
  assert.equal(result.approved.length, 1);
  assert.equal(result.approved[0].id, sam.id);
});

test('removing an approved Kin only removes future eligibility, never invents history', () => {
  const alex = profile('alex');
  const priya = profile('priya');
  const remaining = removeApprovedKin([alex, priya], alex.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, priya.id);
});
