// Native-platform entry point: a thin re-export of the real
// @stripe/stripe-react-native so app code always imports from
// '@/lib/stripe/native-stripe' rather than the package directly. Metro
// resolves this file on iOS/Android and native-stripe.web.tsx on web (its
// standard platform-extension convention), which is what actually keeps the
// real native module — whose spec calls
// `TurboModuleRegistry.getEnforcing('StripeSdk')` at import time and would
// throw immediately in a web bundle — out of the web build entirely.
export { StripeProvider, useStripe, usePaymentSheet } from '@stripe/stripe-react-native';

export const PAYMENT_SHEET_NATIVE_SUPPORT = true;
