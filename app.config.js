const { REQUIRED_BETA_PUBLIC_NAMES, validateBetaPublicConfig } = require('./scripts/beta-public-config.cjs');
const { ensureBetaAssets, ICON_RELATIVE_PATH, SPLASH_RELATIVE_PATH } = require('./scripts/beta-assets.cjs');

ensureBetaAssets();

const betaIntent = process.env.EAS_BUILD_PROFILE === 'beta' || process.env.KINWIN_VALIDATE_BETA === '1';
// EAS CLI's local build preparation evaluates this dynamic config TWICE:
// once with only the build profile's own inline `env` (eas.json's
// beta.env sets KINWIN_VALIDATE_BETA=1) to discover extra.eas.projectId,
// and only afterward — now that a project is known — does it fetch the
// selected EAS "preview" environment's EXPO_PUBLIC_* variables and
// evaluate again. Unconditionally validating on betaIntent alone made that
// first, pre-fetch pass throw (none of the real values have arrived yet),
// which stopped EAS CLI from ever reaching the point where it fetches
// them — an unrecoverable local chicken-and-egg failure with no useful
// error message surfaced (see the eas build/eas env:exec investigation
// this fixes). hasAnyBetaPublicInput distinguishes "first pass, nothing
// has arrived yet" (skip validation, let projectId resolution proceed)
// from "second pass, at least one value has arrived" (validate for real,
// so a partially- or wrongly-configured environment still fails loudly
// rather than silently proceeding with some values missing).
const hasAnyBetaPublicInput = REQUIRED_BETA_PUBLIC_NAMES.some((name) => Boolean(process.env[name]));
// EAS_BUILD=true is set only on the actual remote EAS Build worker (never
// during any local CLI invocation), so this keeps a real remote beta build
// fail-closed even in the pathological case where the worker's own
// environment loading failed and hasAnyBetaPublicInput would otherwise be
// false — a broken beta build must never ship silently. Still gated on
// betaIntent, so an unrelated non-beta EAS build profile is never forced
// through Kinwin's beta validation.
const isRemoteEasBuildWorker = process.env.EAS_BUILD === 'true';
const mustValidateBeta = betaIntent && (isRemoteEasBuildWorker || hasAnyBetaPublicInput);
const beta = mustValidateBeta ? validateBetaPublicConfig(process.env) : null;

// This app config is dynamic (a .js file), so `eas init` cannot write the
// created project's extra.eas.projectId into it automatically (Expo's own
// tooling refuses to rewrite JS config files). Once the EAS project exists,
// its ID is not secret, so it's supplied here via a plain environment
// variable instead: either a real deployment env, or the non-secret
// KINWIN_EAS_PROJECT_ID repository variable the beta-release GitHub Actions
// workflow sets (see .github/workflows/eas-beta-release.yml). If it's unset,
// EAS CLI commands that need project context simply have no project linked
// yet, which is the correct first-run state.
const easProjectId = process.env.KINWIN_EAS_PROJECT_ID;

module.exports = {
  expo: {
    name: 'Kinwin',
    slug: 'kinwin-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: ICON_RELATIVE_PATH,
    scheme: 'kinwin',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: { image: SPLASH_RELATIVE_PATH, resizeMode: 'contain', backgroundColor: '#1a1212' },
    ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.kinwin.mobile.beta',
      buildNumber: '1',
      // Declares ITSAppUsesNonExemptEncryption = false in the built
      // Info.plist. Justified by actual dependency/code inspection, not
      // assumed: the app's only network traffic is HTTPS/TLS to Supabase
      // and Stripe (OS-handled, exempt); the Stripe React Native SDK's
      // native dependency graph (StripeCore/StripeUICore/StripePayments/
      // StripePaymentsUI/StripeApplePay) is Stripe's standard modular
      // payments SDK relying on TLS and Apple Pay's own on-device
      // encryption, not a bundled custom cipher; the only crypto API used
      // in application code is expo-crypto's randomUUID() for idempotency
      // keys/client operation ids (standard system randomness, not
      // confidentiality encryption); the SHA-256 hashing of recipient/
      // organizer invitation tokens happens entirely server-side
      // (Postgres/Edge Functions), never in this app binary; and no
      // SecureStore/Keychain wrapper, VPN, DRM, or messaging-encryption
      // SDK is present anywhere in the dependency tree. Revisit this if a
      // future dependency changes that picture.
      config: { usesNonExemptEncryption: false },
      ...(beta ? { associatedDomains: [`applinks:${beta.invitationHost}`] } : {}),
    },
    android: {
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: { foregroundImage: ICON_RELATIVE_PATH, backgroundColor: '#1a1212' },
    },
    web: { output: 'single' },
    plugins: ['expo-router', ['@stripe/stripe-react-native', { enableGooglePay: false }]],
    experiments: { typedRoutes: true },
  },
};
