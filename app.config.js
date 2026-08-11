const { validateBetaPublicConfig } = require('./scripts/beta-public-config.cjs');

const betaBuild = process.env.EAS_BUILD_PROFILE === 'beta' || process.env.KINWIN_VALIDATE_BETA === '1';
const beta = betaBuild ? validateBetaPublicConfig(process.env) : null;

module.exports = {
  expo: {
    name: 'Kinwin',
    slug: 'kinwin-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'kinwin',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.kinwin.mobile.beta',
      buildNumber: '1',
      ...(beta ? { associatedDomains: [`applinks:${beta.invitationHost}`] } : {}),
    },
    android: { edgeToEdgeEnabled: true, predictiveBackGestureEnabled: false },
    plugins: ['expo-router', ['@stripe/stripe-react-native', { enableGooglePay: false }]],
    experiments: { typedRoutes: true },
  },
};
