import { Href, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useResumableCreationSession } from '@/hooks/use-resumable-creation-session';
import {
  clearCreationSession,
  closeCreationSessionGeneration,
  decideCreateChallengeEntryAction,
  resolveResumeRoute,
} from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';
import { describeChallengeRule } from '@/lib/challenge-creation/summary';
import { playImportantHaptic, playSelectionHaptic } from '@/lib/haptics';

export type CreateChallengeEntryController = {
  readonly cancelDiscardConfirmation: () => void;
  readonly closeResumeSheet: () => void;
  readonly confirmDiscardResumableSession: () => Promise<void>;
  readonly confirmingDiscard: boolean;
  readonly continueResumableSession: () => void;
  readonly discardFailed: boolean;
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
  const [discardFailed, setDiscardFailed] = useState(false);

  const startFreshCreation = () => {
    // resetDraft() itself applies the default currency (saved preference,
    // else device locale) via OnboardingProvider's own fresh-draft-default
    // effect — the one shared boundary every resetDraft() call site relies
    // on, so this hook no longer needs its own resolveDefaultCurrency call
    // (see contexts/onboarding-context.tsx and docs/PRODUCT_DECISIONS.md).
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
      setDiscardFailed(false);
      setResumeSheetOpen(true);
      return;
    }
    startFreshCreation();
  };

  const closeResumeSheet = () => {
    setResumeSheetOpen(false);
    setConfirmingDiscard(false);
    setDiscardFailed(false);
  };

  const requestDiscardConfirmation = () => {
    void playSelectionHaptic();
    setDiscardFailed(false);
    setConfirmingDiscard(true);
  };

  const cancelDiscardConfirmation = () => {
    setConfirmingDiscard(false);
    setDiscardFailed(false);
  };

  const continueResumableSession = () => {
    if (resumableSession.status !== 'found') return;
    void playImportantHaptic();
    const { checkpoint } = resumableSession.session;
    onboarding.restoreCreationSessionFields(checkpoint.fields, checkpoint.lastRoute, checkpoint.savedAt);
    setResumeSheetOpen(false);
    router.push(resolveResumeRoute(checkpoint.lastRoute) as Href);
  };

  const confirmDiscardResumableSession = async () => {
    if (!user) return;
    void playImportantHaptic();
    setDiscardingSession(true);
    setDiscardFailed(false);
    // Closed first: any autosave debounce timer still waiting to fire for
    // this session must recognize itself as stale once it eventually
    // runs, regardless of whether the clear immediately below succeeds.
    closeCreationSessionGeneration(user.id);
    const cleared = await clearCreationSession(user.id, creationSessionStorage);
    setDiscardingSession(false);
    if (!cleared) {
      // Do not present this as a successful discard while the old
      // snapshot might still be sitting in storage — that would let it
      // reappear later. Stay on this sheet so the user can retry.
      setDiscardFailed(true);
      return;
    }
    setResumeSheetOpen(false);
    setConfirmingDiscard(false);
    startFreshCreation();
  };

  const resumableSummary =
    resumableSession.status === 'found'
      ? describeChallengeRule({
          behaviorDirection: resumableSession.session.checkpoint.fields.behaviorDirection,
          behaviorText: resumableSession.session.checkpoint.fields.behaviorText,
          measurementMode: resumableSession.session.checkpoint.fields.measurementMode,
          rhythm: resumableSession.session.checkpoint.fields.rhythm,
        }) || resumableSession.session.checkpoint.fields.goal.trim()
      : '';

  return {
    cancelDiscardConfirmation,
    closeResumeSheet,
    confirmDiscardResumableSession,
    confirmingDiscard,
    continueResumableSession,
    discardFailed,
    discardingSession,
    hasResumableSession: resumableSession.status === 'found',
    refreshResumableSession: resumableSession.refresh,
    requestCreateChallenge,
    requestDiscardConfirmation,
    resumableSummary,
    resumeSheetOpen,
  };
}
