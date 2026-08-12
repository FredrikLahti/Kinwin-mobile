const { validateBetaPublicConfig } = require('./scripts/beta-public-config.cjs');
const { ensureBetaAssets, ICON_RELATIVE_PATH, SPLASH_RELATIVE_PATH } = require('./scripts/beta-assets.cjs');

ensureBetaAssets();

const betaBuild = process.env.EAS_BUILD_PROFILE === 'beta' || process.env.KINWIN_VALIDATE_BETA === '1';
const beta = betaBuild ? validateBetaPublicConfig(process.env) : null;

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
