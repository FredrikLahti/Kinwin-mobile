export type StripeConfig = {
  readonly publishableKey: string;
};

/**
 * Public client configuration only — a Stripe publishable key authorizes
 * nothing by itself and is safe to ship in the app bundle, mirroring
 * lib/supabase/config.ts's readSupabaseConfig(). Stripe secret keys and
 * webhook signing secrets must never be read here or anywhere in
 * application code; they live only in the Edge Function environment (see
 * supabase/functions/.env.example).
 */
export function readStripeConfig(): StripeConfig | null {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return null;
  return { publishableKey };
}

export const MISSING_STRIPE_CONFIG_MESSAGE =
  'Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY. Copy .env.example to .env and fill in a Stripe test-mode publishable key.';
