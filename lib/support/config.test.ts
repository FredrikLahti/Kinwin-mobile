import assert from 'node:assert/strict';
import test from 'node:test';
import { readSupportConfig } from './config';

test('never invents a support address when none is configured', () => {
  const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  assert.equal(readSupportConfig(), null);
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL = '   ';
  assert.equal(readSupportConfig(), null);
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'not-an-email';
  assert.equal(readSupportConfig(), null);
  if (original === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
});

test('accepts a real-looking configured address', () => {
  const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@kinwin.example';
  assert.deepEqual(readSupportConfig(), { email: 'help@kinwin.example' });
  if (original === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
});
