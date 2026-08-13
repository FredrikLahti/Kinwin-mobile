/**
 * Extracts auth params from a Supabase redirect URL, whether GoTrue
 * delivered them as a `#fragment` (the classic implicit-flow shape,
 * `access_token`/`refresh_token`/`type`) or a `?query` string (the PKCE
 * shape, `code`). Equivalent in effect to expo-auth-session's
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
