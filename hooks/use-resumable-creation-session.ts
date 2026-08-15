import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { createLatestRequestGuard, CreationSessionSnapshot, readCreationSession } from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';

export type ResumableCreationSessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'found'; readonly session: CreationSessionSnapshot };

/**
 * Read-only lookup of the signed-in user's resumable local creation
 * session, if any — used by Home (to decide what "+ Create challenge"
 * should do) and Account (to avoid contradicting the separate, complete
 * server-draft "Saved progress" concept). Never writes; see
 * hooks/use-creation-session-autosave.ts for that.
 */
export function useResumableCreationSession(): ResumableCreationSessionState & { readonly refresh: () => void } {
  const { status: authStatus, user } = useAuth();
  const [state, setState] = useState<ResumableCreationSessionState>({ status: 'loading' });
  // See lib/challenge-creation/creation-session.ts's createLatestRequestGuard:
  // a stale read started for a previous user (or a previous call to
  // refresh()) must never be allowed to overwrite state belonging to
  // whoever is current by the time it resolves.
  const guardRef = useRef(createLatestRequestGuard());

  const refresh = useCallback(() => {
    const token = guardRef.current.start();
    if (authStatus !== 'signed_in' || !user) {
      setState({ status: 'none' });
      return;
    }
    // Clears any previous user's visible state synchronously, before the
    // async read even starts — user A's summary must never render, even
    // for one frame, once identity has moved on to user B.
    setState({ status: 'loading' });
    const userId = user.id;
    void readCreationSession(userId, creationSessionStorage).then((session) => {
      if (!guardRef.current.isCurrent(token)) return;
      setState(session ? { status: 'found', session } : { status: 'none' });
    });
  }, [authStatus, user]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  return { ...state, refresh };
}
