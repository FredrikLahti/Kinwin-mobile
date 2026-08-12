const { validateBetaPublicConfig } = require('./scripts/beta-public-config.cjs');
const { ensureBetaAssets, ICON_RELATIVE_PATH, SPLASH_RELATIVE_PATH } = require('./scripts/beta-assets.cjs');

ensureBetaAssets();

const betaBuild = process.env.EAS_BUILD_PROFILE === 'beta' || process.env.KINWIN_VALIDATE_BETA === '1';
const beta = betaBuild ? validateBetaPublicConfig(process.env) : null;

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
