export type AuthStatus = 'signed_out' | 'signed_in' | 'password_recovery';

/**
 * A Supabase PASSWORD_RECOVERY event must never be treated as an ordinary
 * sign-in — every "if signed in, redirect away from this auth screen" check
 * elsewhere in the app (app/index.tsx, app/auth/index.tsx, the root
 * Stack.Protected guard in app/_layout.tsx) only compares against
 * 'signed_in', so keeping recovery a distinct status is what stops those
 * ambient checks from hijacking navigation out of
 * app/auth/reset-password.tsx the moment the recovery session is
 * established — without any of those files needing to know this screen
 * exists. Any other event (including the USER_UPDATED that follows a
 * successful updateUser({password}) call) is an ordinary session update.
 */
export function deriveAuthStatus(event: string, hasSession: boolean): AuthStatus {
  if (event === 'PASSWORD_RECOVERY') return 'password_recovery';
  return hasSession ? 'signed_in' : 'signed_out';
}
