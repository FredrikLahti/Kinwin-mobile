import { AuthStatus } from '@/contexts/auth-context';

export type ConflictKind = 'pending_conflict' | 'active_conflict';

/**
 * The complete, pure decision behind app/create/review.tsx's saveDraft()
 * guard — extracted so the one safety property the founder called out by
 * name (auth restoration must never itself trigger a save/prepare) can be
 * proven without mounting the screen. Signed out (or a still-resolving
 * auth status) always routes to the contextual auth gate, never to a save;
 * only an already-'signed_in' status ever reaches 'save'. Nothing here
 * reacts to a status *transition* — review.tsx only calls this from the
 * explicit "Confirm commitment" tap (confirmCommitment/saveDraft), never
 * from a useEffect watching authStatus, so signing in by itself can change
 * what the next tap of that same button would do, but can never perform
 * the save on its own.
 */
export function resolveCommitmentGateAction(authStatus: AuthStatus): 'open_auth_modal' | 'save' {
  return authStatus === 'signed_in' ? 'save' : 'open_auth_modal';
}

/**
 * The one intentional way out of a pending/active conflict (PR #67's
 * fix — see review.tsx's leaveConflict). Extracted so the single-action,
 * no-retry-loop guarantee for both conflict kinds stays provable in
 * isolation: a pending commitment has its own real screen, an
 * active/completion_mode/awaiting_resolution challenge has no matching row
 * there, so it goes to Home instead.
 */
export function resolveConflictLeaveRoute(conflictKind: ConflictKind): '/account/pending-commitment' | '/home' {
  return conflictKind === 'pending_conflict' ? '/account/pending-commitment' : '/home';
}
