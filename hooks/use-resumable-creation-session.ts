import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import {
  CreationSessionCheckpoint,
  createLatestRequestGuard,
  CreationSessionSnapshot,
  isResumeEligibleSession,
  readCreationSession,
} from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';

export type ResumableCreationSessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | {
      readonly status: 'found';
      // checkpoint narrowed to non-null: "found" is defined as
      // isResumeEligibleSession(session), which already guarantees this —
      // consumers (Continue) never need to null-check it again.
      readonly session: CreationSessionSnapshot & { readonly checkpoint: CreationSessionCheckpoint };
    };

/**
 * Read-only lookup of the signed-in user's resumable local creation
 * session, if any — used by Home (to decide what "+ Create challenge"
 * should do) and Account (to avoid contradicting the separate, complete
 * server-draft "Saved progress" concept). Never writes; see
 * hooks/use-creation-session-autosave.ts for that.
 *
 * "found" here specifically means isResumeEligibleSession(session) —
 * a snapshot that only exists because of quiet background autosave
 * (never explicitly Saved & exited) is reported as "none", exactly like
 * no session at all. This is the one place that filtering happens, so
 * Home and Account can never drift on what counts as something the user
 * consciously chose to save for later.
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
      // session.checkpoint (not isResumeEligibleSession(session), which
      // returns a plain boolean) is checked directly here so TypeScript
      // narrows checkpoint to non-null for the 'found' branch below —
      // isResumeEligibleSession remains the single documented rule for
      // what "eligible" means and is what every other caller should use.
      // Re-spreading with the narrowed checkpoint carries that narrowing
      // into the constructed object's type, not just this expression.
      setState(
        session && session.checkpoint && isResumeEligibleSession(session)
          ? { status: 'found', session: { ...session, checkpoint: session.checkpoint } }
          : { status: 'none' },
      );
    });
  }, [authStatus, user]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.id]);

  return { ...state, refresh };
}
