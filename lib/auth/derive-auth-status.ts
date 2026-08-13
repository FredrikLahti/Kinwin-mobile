export type AuthStatus = 'signed_out' | 'signed_in' | 'password_recovery';

/**
 * Ordinary event-to-status mapping, used by AuthProvider whenever Kinwin's
 * own recovery mode (contexts/auth-context.tsx's recoveryModeRef, governed
 * by lib/auth/recovery-mode-status.ts) is NOT active. This alone is not
 * sufficient to protect app/auth/reset-password.tsx: Kinwin establishes its
 * recovery session with a plain setSession() call, which the installed
 * @supabase/auth-js only ever notifies as 'SIGNED_IN' (or
 * 'TOKEN_REFRESHED') for — never the SDK's own 'PASSWORD_RECOVERY' event,
 * which is emitted only by automatic detectSessionInUrl (disabled here) or
 * exchangeCodeForSession (PKCE, not used here). The 'PASSWORD_RECOVERY'
 * case below is kept for a real event Supabase can still emit through
 * other code paths this app doesn't currently exercise — it costs nothing
 * to handle correctly, but the actual protection for reset-password.tsx's
 * real call pattern is recoveryModeRef + deriveStatusDuringRecovery, not
 * this function.
 */
export function deriveAuthStatus(event: string, hasSession: boolean): AuthStatus {
  if (event === 'PASSWORD_RECOVERY') return 'password_recovery';
  return hasSession ? 'signed_in' : 'signed_out';
}
