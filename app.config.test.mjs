// Regression coverage for app.config.js's two-pass EAS Build gating (see its
// own comment above `betaIntent`/`hasAnyBetaPublicInput`/`isRemoteEasBuildWorker`).
// app.config.js is a CommonJS module with env-dependent, module-load-time
// side effects, so each scenario below sets process.env, clears Node's
// require cache for the exact resolved path, and requires it fresh — the
// only reliable way to exercise a dynamic Expo config file under different
// environments in one process.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const CONFIG_PATH = require.resolve('./app.config.js');

const BETA_PUBLIC_NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL',
];
const GATING_NAMES = ['EAS_BUILD_PROFILE', 'KINWIN_VALIDATE_BETA', 'EAS_BUILD'];
const ALL_MANAGED_NAMES = [...BETA_PUBLIC_NAMES, ...GATING_NAMES];

const VALID_BETA_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://ywoledppusxwdonwsewh.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test_value',
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_value',
  EXPO_PUBLIC_SUPPORT_EMAIL: 'support@kinwin.app',
  EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL: 'https://kinwin-beta.expo.app',
};

// Loads app.config.js fresh under exactly the given env overrides — every
// other managed name is explicitly cleared first, so no test can leak env
// state into another regardless of run order.
function loadConfigWith(envOverrides) {
  const previous = {};
  for (const name of ALL_MANAGED_NAMES) previous[name] = process.env[name];
  try {
    for (const name of ALL_MANAGED_NAMES) delete process.env[name];
    Object.assign(process.env, envOverrides);
    delete require.cache[CONFIG_PATH];
    return require(CONFIG_PATH);
  } finally {
    for (const name of ALL_MANAGED_NAMES) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    delete require.cache[CONFIG_PATH];
  }
}

test('first pass: beta intent with none of the preview values arrived yet resolves without throwing (EAS CLI\'s local projectId-discovery pass)', () => {
  const config = loadConfigWith({ KINWIN_VALIDATE_BETA: '1' });
  assert.equal(config.expo.slug, 'kinwin-mobile');
  assert.equal(config.expo.ios.associatedDomains, undefined);
});

test('second pass, valid: beta intent with the complete valid public TEST configuration validates and derives the invitation associatedDomain', () => {
  const config = loadConfigWith({ KINWIN_VALIDATE_BETA: '1', ...VALID_BETA_ENV });
  assert.deepEqual(config.expo.ios.associatedDomains, ['applinks:kinwin-beta.expo.app']);
});

test('second pass, partial: beta intent with only some preview values arrived still fails strict validation', () => {
  assert.throws(
    () => loadConfigWith({ KINWIN_VALIDATE_BETA: '1', EXPO_PUBLIC_SUPABASE_URL: VALID_BETA_ENV.EXPO_PUBLIC_SUPABASE_URL }),
    /TEST public anon or publishable key/,
  );
});

test('second pass, invalid: beta intent with a complete but wrong public configuration still fails strict validation', () => {
  assert.throws(
    () => loadConfigWith({ KINWIN_VALIDATE_BETA: '1', ...VALID_BETA_ENV, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_value' }),
    /Stripe TEST publishable key/,
  );
});

test('remote EAS Build worker stays fail-closed even if preview values never arrived at all', () => {
  assert.throws(
    () => loadConfigWith({ KINWIN_VALIDATE_BETA: '1', EAS_BUILD: 'true' }),
    /Kinwin hosted TEST Supabase URL/,
  );
});

test('an unrelated non-beta EAS Build worker is never forced through Kinwin\'s beta validation', () => {
  const config = loadConfigWith({ EAS_BUILD: 'true' });
  assert.equal(config.expo.ios.associatedDomains, undefined);
});

test('no beta intent at all (ordinary local development) resolves exactly as before, untouched', () => {
  const config = loadConfigWith({});
  assert.equal(config.expo.slug, 'kinwin-mobile');
  assert.equal(config.expo.ios.associatedDomains, undefined);
});
