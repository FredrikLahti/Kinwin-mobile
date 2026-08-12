const { validateBetaPublicConfig } = require('./scripts/beta-public-config.cjs');
const { ensureBetaAssets, ICON_RELATIVE_PATH, SPLASH_RELATIVE_PATH } = require('./scripts/beta-assets.cjs');

ensureBetaAssets();

const betaBuild = process.env.EAS_BUILD_PROFILE === 'beta' || process.env.KINWIN_VALIDATE_BETA === '1';
const beta = betaBuild ? validateBetaPublicConfig(process.env) : null;

// This app config is dynamic (a .js file), so `eas init` couldn't write the
// created project's extra.eas.projectId into it automatically (Expo's own
// tooling refuses to rewrite JS config files) — the beta-release GitHub
// Actions workflow's first bootstrap run created the real EAS project
// (@kinwin/kinwin-mobile) and surfaced its ID in the run log. The ID isn't
// secret, so it's committed here as the default; KINWIN_EAS_PROJECT_ID can
// still override it (e.g. to point at a different project) if ever needed.
// The workflow always defines this env var (empty string when the repo
// variable is unset), so `||` (not `??`) is required for the default to
// actually apply there.
const easProjectId = process.env.KINWIN_EAS_PROJECT_ID || 'f229b6b8-d2ab-4815-a32c-c2952f6995ec';

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
