import { Href, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useResumableCreationSession } from '@/hooks/use-resumable-creation-session';
import { clearCreationSession, decideCreateChallengeEntryAction, resolveResumeRoute } from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export type CreateChallengeEntryController = {
  readonly cancelDiscardConfirmation: () => void;
  readonly closeResumeSheet: () => void;
  readonly confirmDiscardResumableSession: () => Promise<void>;
  readonly confirmingDiscard: boolean;
  readonly continueResumableSession: () => void;
  readonly discardingSession: boolean;
  readonly hasResumableSession: boolean;
  readonly refreshResumableSession: () => void;
  readonly requestCreateChallenge: (hasPendingCommitment: boolean) => void;
  readonly requestDiscardConfirmation: () => void;
  readonly resumableSummary: string;
  readonly resumeSheetOpen: boolean;
};

/**
 * The shared "+ Create challenge" entry decision: pending commitment always
 * wins (routes to it, never competes with a resume prompt); otherwise a
 * resumable local session opens a "Challenge in progress" sheet (Continue /
 * Start a new challenge, the latter gated behind its own destructive
 * confirmation); otherwise creation starts completely fresh.
 *
 * Used identically by Home's primary CTA and Account's "Start a new draft
 * instead" — a single shared implementation so neither surface can ever
 * silently discard unfinished local progress that the other would have
 * confirmed first.
 */
export function useCreateChallengeEntry(): CreateChallengeEntryController {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { user } = useAuth();
  const resumableSession = useResumableCreationSession();
  const [resumeSheetOpen, setResumeSheetOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [discardingSession, setDiscardingSession] = useState(false);

  const startFreshCreation = () => {
    onboarding.resetDraft();
    router.push('/create/intro' as Href);
  };

  const requestCreateChallenge = (hasPendingCommitment: boolean) => {
    const action = decideCreateChallengeEntryAction(hasPendingCommitment, resumableSession.status === 'found');
    if (action === 'open_pending_commitment') {
      void playSelectionHaptic();
      router.push('/account/pending-commitment' as Href);
      return;
    }
    void playImportantHaptic();
    if (action === 'prompt_resume') {
      setConfirmingDiscard(false);
      setResumeSheetOpen(true);
      return;
    }
    startFreshCreation();
  };

  const closeResumeSheet = () => {
    setResumeSheetOpen(false);
    setConfirmingDiscard(false);
  };

  const requestDiscardConfirmation = () => {
    void playSelectionHaptic();
    setConfirmingDiscard(true);
  };

  const cancelDiscardConfirmation = () => setConfirmingDiscard(false);

  const continueResumableSession = () => {
    if (resumableSession.status !== 'found') return;
    void playImportantHaptic();
    onboarding.restoreCreationSessionFields(resumableSession.session.fields);
    setResumeSheetOpen(false);
    router.push(resolveResumeRoute(resumableSession.session.lastRoute) as Href);
  };

  const confirmDiscardResumableSession = async () => {
    if (!user) return;
    void playImportantHaptic();
    setDiscardingSession(true);
    await clearCreationSession(user.id, creationSessionStorage);
    setDiscardingSession(false);
    setResumeSheetOpen(false);
    setConfirmingDiscard(false);
    startFreshCreation();
  };

  const resumableSummary =
    resumableSession.status === 'found'
      ? describeChallengeRule({
          behaviorDirection: resumableSession.session.fields.behaviorDirection,
          behaviorText: resumableSession.session.fields.behaviorText,
          measurementMode: resumableSession.session.fields.measurementMode,
          rhythm: resumableSession.session.fields.rhythm,
        }) || resumableSession.session.fields.goal.trim()
      : '';

  return {
    cancelDiscardConfirmation,
    closeResumeSheet,
    confirmDiscardResumableSession,
    confirmingDiscard,
    continueResumableSession,
    discardingSession,
    hasResumableSession: resumableSession.status === 'found',
    refreshResumableSession: resumableSession.refresh,
    requestCreateChallenge,
    requestDiscardConfirmation,
    resumableSummary,
    resumeSheetOpen,
  };
}
