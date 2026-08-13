/**
 * Extracts arbitrary key/value params from a redirect URL, whether they
 * arrive as a `#fragment` or a `?query` string — a small, generic parse,
 * not auth-specific. Kinwin's Supabase client is deliberately configured
 * for the implicit auth flow (see lib/supabase/client.ts's `flowType`
 * comment for why), so the only shape this app's own recovery/confirmation
 * links actually use is the `#fragment` one, carrying `access_token` /
 * `refresh_token` / `type` directly — never a PKCE `?code=`, which this app
 * does not exchange. Equivalent in effect to expo-auth-session's
 * `QueryParams.getQueryParams` (used in Supabase's own React Native guide)
 * but written by hand here to avoid adding a new dependency for one small,
 * easily-tested parse.
 */
export function parseAuthRedirectParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const paramsString = hashIndex >= 0 ? url.slice(hashIndex + 1) : queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(paramsString)) params[key] = value;
  return params;
}
