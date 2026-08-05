/**
 * The urlScheme StripeProvider needs to correctly return to this app after a
 * card's redirect/3D-Secure step, in Expo Go as well as the future
 * standalone build. Expo Go does not own the app's own "kinwin" scheme — it
 * runs every project under its own (dynamic) exp:// scheme — so a fixed
 * scheme string only round-trips in a standalone/custom-dev-client build.
 * This mirrors Expo's documented pattern for @stripe/stripe-react-native.
 */
export function resolveStripeUrlScheme(input: {
  readonly appOwnership: string | null;
  readonly createURL: (path: string) => string;
}): string {
  return input.appOwnership === 'expo' ? input.createURL('/--/') : input.createURL('');
}
