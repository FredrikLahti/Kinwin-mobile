import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import {
  CreationSessionFields,
  currentCreationSessionGeneration,
  hasMeaningfulCreationProgress,
  writeCreationSession,
} from '@/lib/challenge-creation/creation-session';
import { creationSessionStorage } from '@/lib/challenge-creation/creation-session-storage';

const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Quietly persists in-progress challenge creation for the signed-in user as
 * they move through app/create/* — no manual "Save" anywhere in the flow.
 * Only ever used from components/v2/create-flow-screen.tsx, which is
 * exactly the set of screens between "intro" (nothing entered yet) and
 * "share" (already converted into a real server commitment) — so this
 * naturally never fires on either of those.
 *
 * Anonymous (signed-out) creation is intentionally left exactly as it
 * behaves today: pure in-memory state, nothing written to disk. Without a
 * stable user id there is no safe way to isolate or later restore it, and
 * the resumable-creation UX this powers (app/home/index.tsx) only exists
 * behind Home, which already requires sign-in.
 */
export function useCreationSessionAutosave(): {
  readonly meaningfulProgress: boolean;
  /** Cancels any pending debounced write and saves immediately, returning whether it actually succeeded — never "in flight and forgotten." */
  readonly flush: () => Promise<boolean>;
} {
  const onboarding = useOnboarding();
  const { status, user } = useAuth();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fields: CreationSessionFields = {
    behaviorDirection: onboarding.behaviorDirection,
    behaviorText: onboarding.behaviorText,
    definitionText: onboarding.definitionText,
    durationWeeks: onboarding.durationWeeks,
    experienceCategory: onboarding.experienceCategory,
    goal: onboarding.goal,
    invitationMessage: onboarding.invitationMessage,
    invitationMessageCustomized: onboarding.invitationMessageCustomized,
    membershipChoice: onboarding.membershipChoice,
    measurementMode: onboarding.measurementMode,
    recipients: onboarding.recipients,
    rewardOrganizer: onboarding.rewardOrganizer,
    rhythm: onboarding.rhythm,
    sitOutAcknowledged: onboarding.sitOutAcknowledged,
    stakeAmount: onboarding.stakeAmount,
    stakeAmountInput: onboarding.stakeAmountInput,
  };
  const meaningfulProgress = hasMeaningfulCreationProgress(fields);
  const userId = status === 'signed_in' ? user?.id ?? null : null;

  const save = async (generation: number): Promise<boolean> => {
    if (!userId || !meaningfulProgress) return true;
    return writeCreationSession(userId, fields, pathname, creationSessionStorage, generation);
  };

  useEffect(() => {
    if (!userId || !meaningfulProgress) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Captured now, when the debounced write is scheduled — not when the
    // timer eventually fires. If the creation lifecycle this edit belongs
    // to has been closed (server conversion or explicit discard) by the
    // time this timer fires, writeCreationSession recognizes the
    // generation as stale and skips the write, however long that takes —
    // see lib/challenge-creation/creation-session.ts's
    // creationSessionGenerations for why this can't just rely on
    // clearTimeout-on-unmount or queue position alone.
    const generation = currentCreationSessionGeneration(userId);
    // Background autosave is fire-and-forget by design — a failure here is
    // not fatal, since the very next change re-arms this same debounce and
    // tries again. Only an explicit flush() (see below) needs to know
    // whether a save actually landed.
    timerRef.current = setTimeout(() => { void save(generation); }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, meaningfulProgress, pathname, JSON.stringify(fields)]);

  const flush = async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // An explicit, synchronous user action (Exit) rather than a delayed
    // timer — reading the generation fresh right now is correct, there is
    // no meaningful debounce window here to race against.
    return save(userId ? currentCreationSessionGeneration(userId) : 0);
  };

  return { meaningfulProgress, flush };
}
