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

export type ChallengeResultPresentation = { readonly eyebrow: string; readonly headline: string; readonly meaning: string; readonly homeStatus: string; readonly tone: 'success' | 'failure' };
export function describeChallengeResult(status: TerminalChallengeStatus): ChallengeResultPresentation {
  return status === 'completed_success'
    ? { eyebrow: 'CHALLENGE COMPLETE', headline: 'You kept it.', meaning: 'You kept this challenge. The failure consequence does not apply.', homeStatus: 'Completed. You kept it.', tone: 'success' }
    : { eyebrow: 'CHALLENGE COMPLETE', headline: 'You did not keep it.', meaning: 'This challenge is final. Its consequence is handled separately.', homeStatus: 'Completed. Not kept.', tone: 'failure' };
}

export function formatCompletedDate(value: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}
