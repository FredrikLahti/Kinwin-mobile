import assert from 'node:assert/strict';
import test from 'node:test';

import { classifySupabaseError } from './classify-error';

test('each documented GoTrue error message maps to its own safe, user-facing state', () => {
  assert.equal(classifySupabaseError('Invalid login credentials').kind, 'invalid_credentials');
  assert.equal(classifySupabaseError('User already registered').kind, 'duplicate_account');
  assert.equal(classifySupabaseError('Password should be at least 8 characters').kind, 'weak_password');
  assert.equal(classifySupabaseError('Network request failed').kind, 'network');
  assert.equal(classifySupabaseError('Email not confirmed').kind, 'email_not_confirmed');
  assert.equal(classifySupabaseError('Email link is invalid or has expired').kind, 'link_expired');
  assert.equal(classifySupabaseError('Email rate limit exceeded').kind, 'rate_limited');
});

test('email-not-confirmed never gets reported as invalid credentials', () => {
  const result = classifySupabaseError('Email not confirmed');
  assert.notEqual(result.kind, 'invalid_credentials');
  assert.match(result.message, /confirm your email/i);
});

test('an unrecognized provider error never leaks its raw text to the user', () => {
  const raw = 'duplicate key value violates unique constraint "some_internal_pgtable_pkey"';
  const result = classifySupabaseError(raw);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.message, 'Something went wrong. Try again.');
  assert.notEqual(result.message, raw);
  assert.equal(result.message.includes('constraint'), false);
});

test('a missing error message also falls back to the safe generic message', () => {
  const result = classifySupabaseError(undefined);
  assert.equal(result.kind, 'unknown');
  assert.equal(result.message, 'Something went wrong. Try again.');
});
