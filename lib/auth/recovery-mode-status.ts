import { AuthStatus } from './derive-auth-status';

export type RecoveryModeTransition = {
  readonly status: AuthStatus;
  /** True once Kinwin's own recovery mode should stop overriding future events. */
  readonly exitRecoveryMode: boolean;
};

/**
 * Governs auth-state events while Kinwin's own recovery mode is active
 * (set by applyRecoverySession, cleared here or on a failed setSession
 * call). This exists because the installed @supabase/auth-js (2.112.0)
 * only emits its own 'PASSWORD_RECOVERY' event from two code paths Kinwin
 * deliberately does not use — automatic detectSessionInUrl (web-only,
 * disabled here) and exchangeCodeForSession (PKCE, not used — see
 * lib/supabase/client.ts). A manual setSession() call with implicit-flow
 * tokens (what app/auth/reset-password.tsx actually does) always notifies
 * plain 'SIGNED_IN' (or 'TOKEN_REFRESHED' if the token had expired) per
 * GoTrueClient.js's _setSession — confirmed by reading that exact source,
 * not assumed. So Kinwin cannot rely on Supabase's own event to know a
 * session came from recovery; deriveAuthStatus alone is not sufficient for
 * this call pattern, and recovery must be tracked explicitly instead.
 *
 * 'USER_UPDATED' is the one event that means recovery is actually done —
 * it is what fires after a successful updateUser({password}) call — so it
 * is the sole signal that promotes the session to an ordinary signed-in
 * one. Losing the session entirely (SIGNED_OUT, or any event with no
 * session) also exits recovery mode rather than leaving it stuck. Every
 * other event while recovering (SIGNED_IN from setSession itself,
 * TOKEN_REFRESHED, etc.) keeps status at 'password_recovery'.
 */
export function deriveStatusDuringRecovery(event: string, hasSession: boolean): RecoveryModeTransition {
  if (event === 'USER_UPDATED' && hasSession) return { status: 'signed_in', exitRecoveryMode: true };
  if (!hasSession) return { status: 'signed_out', exitRecoveryMode: true };
  return { status: 'password_recovery', exitRecoveryMode: false };
}
