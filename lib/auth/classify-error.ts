export type AuthErrorKind =
  | 'not_configured'
  | 'invalid_credentials'
  | 'duplicate_account'
  | 'weak_password'
  | 'network'
  | 'unknown';

/**
 * Maps a raw GoTrue error message to a safe, user-facing message. The
 * fallback ('unknown') never repeats the raw provider text — an
 * unrecognized error could be an internal detail (a constraint name, a
 * stack fragment) that must never reach the user.
 */
export function classifySupabaseError(message: string | undefined): { readonly kind: AuthErrorKind; readonly message: string } {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login credentials') || text.includes('invalid email or password')) {
    return { kind: 'invalid_credentials', message: 'That email and password combination is incorrect.' };
  }
  if (text.includes('already registered') || text.includes('already exists') || text.includes('user already')) {
    return { kind: 'duplicate_account', message: 'An account with that email already exists. Try signing in instead.' };
  }
  if (text.includes('password') && (text.includes('short') || text.includes('at least') || text.includes('weak'))) {
    return { kind: 'weak_password', message: 'Choose a longer password (at least 8 characters).' };
  }
  if (text.includes('network') || text.includes('fetch') || text.includes('failed to connect')) {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: 'Something went wrong. Try again.' };
}
