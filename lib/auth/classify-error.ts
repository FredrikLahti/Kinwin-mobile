export type AuthErrorKind =
  | 'not_configured'
  | 'invalid_credentials'
  | 'duplicate_account'
  | 'weak_password'
  | 'email_not_confirmed'
  | 'link_expired'
  | 'rate_limited'
  | 'not_authenticated'
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
  if (text.includes('email not confirmed')) {
    return { kind: 'email_not_confirmed', message: 'Confirm your email before signing in. Check your inbox for the confirmation link.' };
  }
  if (text.includes('link is invalid or has expired') || text.includes('token has expired') || text.includes('invalid or expired')) {
    return { kind: 'link_expired', message: 'This link is no longer valid. Request a new one.' };
  }
  if (text.includes('invalid login credentials') || text.includes('invalid email or password')) {
    return { kind: 'invalid_credentials', message: 'That email and password combination is incorrect.' };
  }
  if (text.includes('already registered') || text.includes('already exists') || text.includes('user already')) {
    return { kind: 'duplicate_account', message: 'An account with that email already exists. Try signing in instead.' };
  }
  if (text.includes('password') && (text.includes('short') || text.includes('at least') || text.includes('weak') || text.includes('different from the old'))) {
    return { kind: 'weak_password', message: 'Choose a different password (at least 8 characters).' };
  }
  if (text.includes('rate limit') || text.includes('too many requests')) {
    return { kind: 'rate_limited', message: 'Too many requests. Try again in a few minutes.' };
  }
  if (text.includes('network') || text.includes('fetch') || text.includes('failed to connect')) {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: 'Something went wrong. Try again.' };
}
