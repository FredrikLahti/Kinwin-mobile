export type SupabaseConfig = {
  readonly url: string;
  readonly anonKey: string;
};

/**
 * Public client configuration only — the anon key is safe to ship in the app
 * bundle by design (it is the identity RLS enforces against, not a secret).
 * `service_role`, provider secrets, and any hosted credential must never be
 * read here or anywhere else in application code.
 */
export function readSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const MISSING_SUPABASE_CONFIG_MESSAGE =
  'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env, start a local Supabase project, and fill in its values.';
