const { parseInvitationOrigin } = require('./beta-invitation-origin.cjs');

const EXPECTED_SUPABASE_URL = 'https://ywoledppusxwdonwsewh.supabase.co';
const FORBIDDEN_CLIENT_NAMES = ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SIGNING_SECRET','TREMENDOUS_API_KEY','KINWIN_CRON_SECRET_KEY'];
// Same shape as lib/support/config.ts's own EMAIL_PATTERN — kept as a
// separate literal here rather than imported, since this is a standalone
// .cjs script app.config.js loads directly, not part of the TS app bundle.
const SUPPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jwtRole(value) {
  try { return JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString('utf8')).role; }
  catch { return null; }
}

function validateBetaPublicConfig(env) {
  for (const name of FORBIDDEN_CLIENT_NAMES) if (env[name]) throw new Error(`Server secret ${name} must not be present in the beta client build environment.`);
  if (env.EXPO_PUBLIC_SUPABASE_URL !== EXPECTED_SUPABASE_URL) throw new Error('Beta builds require the Kinwin hosted TEST Supabase URL.');
  const publicKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!publicKey || publicKey.startsWith('sb_secret_') || jwtRole(publicKey) === 'service_role') throw new Error('Beta builds require the TEST public anon or publishable key.');
  if (!(env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_')) throw new Error('Beta builds require a Stripe TEST publishable key.');
  if (!SUPPORT_EMAIL_PATTERN.test(env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '')) throw new Error('Beta builds require a real support contact email.');
  let invitationHost;
  try { ({ host: invitationHost } = parseInvitationOrigin(env.EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL)); }
  catch (error) { throw new Error(`Beta invitation configuration is invalid: ${error.message}.`); }
  return { invitationHost };
}

module.exports = { EXPECTED_SUPABASE_URL, FORBIDDEN_CLIENT_NAMES, validateBetaPublicConfig };
