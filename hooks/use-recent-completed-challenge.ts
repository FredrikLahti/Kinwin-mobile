import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { CompletedChallenge, fetchRecentCompletedChallenge } from '@/lib/supabase/completed-challenge-repository';

export type RecentCompletedChallengeState =
  | { readonly status: 'loading' } | { readonly status: 'none' }
  | { readonly status: 'ready'; readonly data: CompletedChallenge }
  | { readonly status: 'error'; readonly message: string };

export function useRecentCompletedChallenge() {
  const { status: authStatus, user } = useAuth();
  const [state, setState] = useState<RecentCompletedChallengeState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    if (!user) { setState({ status: 'none' }); return; }
    const result = await fetchRecentCompletedChallenge(user.id);
    if (!result.ok) setState({ status: 'error', message: 'message' in result ? result.message : 'Could not load your last challenge.' });
    else if (result.data) setState({ status: 'ready', data: result.data });
    else setState({ status: 'none' });
  }, [user]);
  useEffect(() => { if (authStatus !== 'loading') void refresh(); }, [authStatus, refresh]);
  return { state, refresh };
}
