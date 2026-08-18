import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCommitmentGateAction, resolveConflictLeaveRoute } from './review-commitment-gate';

test('resolveCommitmentGateAction: signed_in routes to save', () => {
  assert.equal(resolveCommitmentGateAction('signed_in'), 'save');
});

test('resolveCommitmentGateAction: signed_out routes to the auth gate, never to save', () => {
  assert.equal(resolveCommitmentGateAction('signed_out'), 'open_auth_modal');
});

test('resolveCommitmentGateAction: loading (session still resolving) routes to the auth gate, never to save', () => {
  assert.equal(resolveCommitmentGateAction('loading'), 'open_auth_modal');
});

test('resolveCommitmentGateAction: password_recovery routes to the auth gate, never to save — recovering a session is not the same as confirming a commitment', () => {
  assert.equal(resolveCommitmentGateAction('password_recovery'), 'open_auth_modal');
});

test('resolveConflictLeaveRoute: a pending conflict goes to the real pending-commitment screen', () => {
  assert.equal(resolveConflictLeaveRoute('pending_conflict'), '/account/pending-commitment');
});

test('resolveConflictLeaveRoute: an active conflict goes to Home, which already surfaces the real active challenge', () => {
  assert.equal(resolveConflictLeaveRoute('active_conflict'), '/home');
});
