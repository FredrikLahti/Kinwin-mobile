import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { CreationSessionSnapshot, readCreationSession } from '@/lib/challenge-creation/creation-session';
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

  const refresh = useCallback(() => {
    if (authStatus !== 'signed_in' || !user) {
      setState({ status: 'none' });
      return;
    }
    setState({ status: 'loading' });
    void readCreationSession(user.id, creationSessionStorage).then((session) => {
      setState(session ? { status: 'found', session } : { status: 'none' });
    });
  }, [authStatus, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
