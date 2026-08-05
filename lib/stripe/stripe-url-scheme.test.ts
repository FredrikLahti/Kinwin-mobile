import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStripeUrlScheme } from './stripe-url-scheme';

test('Expo Go (appOwnership "expo") uses the /--/ deep-link path form', () => {
  const createURL = (path: string) => `exp://192.168.1.5:8081${path}`;
  assert.equal(resolveStripeUrlScheme({ appOwnership: 'expo', createURL }), 'exp://192.168.1.5:8081/--/');
});

test('a standalone/custom-dev-client build (no Expo Go ownership) uses the app scheme directly', () => {
  const createURL = (path: string) => `kinwin://${path}`;
  assert.equal(resolveStripeUrlScheme({ appOwnership: null, createURL }), 'kinwin://');
});

test('a bare-workflow ownership value also uses the app scheme directly', () => {
  const createURL = (path: string) => `kinwin://${path}`;
  assert.equal(resolveStripeUrlScheme({ appOwnership: 'standalone', createURL }), 'kinwin://');
});
