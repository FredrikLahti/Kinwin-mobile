import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { buildActiveChallengeViewModel, ActiveChallengeViewModel } from '@/lib/challenge-ux-preview/view-model';
import { ActiveChallengeData, fetchActiveChallenge } from '@/lib/supabase/active-challenge-repository';
import { IsoDateTime } from '@/domain/challenge/types';

export type RealActiveChallengeState =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'ready'; readonly data: ActiveChallengeData; readonly view: ActiveChallengeViewModel }
  | { readonly status: 'error'; readonly message: string };

/**
 * The real counterpart to the old `useActiveChallengeView` (which reads
 * `ChallengePreviewProvider`'s session-only simulation): reads the signed-in
 * user's genuinely persisted active challenge — real Supabase rows, real
 * generated periods, real check-in history — and feeds them through the
 * same, real `buildActiveChallengeViewModel` the check-in UX review tool
 * already uses (see lib/challenge-ux-preview/view-model.ts's own header
 * comment: it formats and selects, it never recomputes domain status
 * itself). `refresh` is exposed so a screen can re-pull state right after a
 * successful check-in or activation, since nothing here subscribes to
 * realtime changes.
 */
export function useRealActiveChallenge() {
  const { status: authStatus, user } = useAuth();
  const [state, setState] = useState<RealActiveChallengeState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ status: 'none' });
      return;
    }
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const result = await fetchActiveChallenge(user.id);
    if (!result.ok) {
      const message = 'message' in result ? result.message : 'Could not load your active challenge.';
      setState({ status: 'error', message });
      return;
    }
    if (!result.data) {
      setState({ status: 'none' });
      return;
    }
    const view = buildActiveChallengeViewModel({
      challenge: result.data.challenge,
      periods: result.data.periods,
      events: result.data.events,
      now: new Date().toISOString() as IsoDateTime,
    });
    setState({ status: 'ready', data: result.data, view });
  }, [user]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    void refresh();
    // Only re-run when the signed-in identity actually changes — polling on
    // an interval or on every render would just be noise for a screen that
    // already calls `refresh()` explicitly after any action that changes
    // this state (activation, check-in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  return { state, refresh };
}
