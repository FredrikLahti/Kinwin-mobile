import { TerminalChallengeStatus } from '@/lib/supabase/completed-challenge-repository';

export type HomeChallengeSurface = 'loading' | 'active' | 'completed' | 'empty' | 'error';
export function chooseHomeChallengeSurface(activeStatus: 'loading' | 'none' | 'ready' | 'error', completedStatus: 'loading' | 'none' | 'ready' | 'error'): HomeChallengeSurface {
  if (activeStatus === 'ready') return 'active';
  if (activeStatus === 'loading') return 'loading';
  if (activeStatus === 'error') return 'error';
  if (completedStatus === 'loading') return 'loading';
  if (completedStatus === 'ready') return 'completed';
  if (completedStatus === 'error') return 'error';
  return 'empty';
}

/**
 * True exactly when the owner's active challenge just disappeared (`ready`
 * -> `none`) — the signal that a fire-and-forget server finalize (see
 * useRealActiveChallenge's own refresh()) turned it into a terminal
 * completed_success/completed_failure row in the background, not just an
 * ordinary "nothing active yet" mount. Only then is the separately-fetched
 * recent-completed-challenge state stale enough to be worth a network
 * round trip: refetching on every unrelated active-status change (e.g.
 * 'loading' -> 'ready') would be wasted work chasing a card that hasn't
 * moved. Without this, Home can flash the empty "No active challenge yet"
 * state for as long as the user stays on Home after their last check-in
 * finalizes a challenge, instead of the real completed-challenge card,
 * until the next focus event happens to refetch it.
 */
export function shouldRefreshCompletedAfterActiveTransition(
  previousActiveStatus: 'loading' | 'none' | 'ready' | 'error',
  currentActiveStatus: 'loading' | 'none' | 'ready' | 'error',
): boolean {
  return previousActiveStatus === 'ready' && currentActiveStatus === 'none';
}

export type ChallengeResultPresentation = { readonly eyebrow: string; readonly headline: string; readonly meaning: string; readonly homeStatus: string; readonly tone: 'success' | 'failure' };
export function describeChallengeResult(status: TerminalChallengeStatus): ChallengeResultPresentation {
  return status === 'completed_success'
    ? { eyebrow: 'CHALLENGE COMPLETE', headline: 'You kept it.', meaning: 'You kept this challenge. The failure consequence does not apply.', homeStatus: 'Completed. You kept it.', tone: 'success' }
    : { eyebrow: 'CHALLENGE COMPLETE', headline: 'You did not keep this one.', meaning: 'The challenge is final. Now the consequence moves to the people you chose.', homeStatus: 'Challenge missed', tone: 'failure' };
}

export function formatCompletedDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
