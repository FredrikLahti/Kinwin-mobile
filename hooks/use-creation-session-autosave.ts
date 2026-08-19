import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import {
  CreationSessionCheckpoint,
  CreationSessionFields,
  currentCreationSessionGeneration,
  hasMeaningfulCreationProgress,
  saveCreationSessionCheckpoint,
  writeCreationSessionWorking,
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
 *
 * This background autosave only ever updates the "working" crash-recovery
 * half of the local session — it carries whatever explicit checkpoint
 * (onboarding.checkpoint) currently exists straight through, unmodified,
 * and can never create or change one on its own. Only saveCheckpoint()
 * below does that.
 */
export function useCreationSessionAutosave(): {
  readonly fields: CreationSessionFields;
  readonly meaningfulProgress: boolean;
  /**
   * The explicit "Save & exit" action: cancels any pending debounced
   * write, persists the latest fields as the new explicit checkpoint, and
   * — only once that write has actually succeeded — updates onboarding
   * state so the checkpoint carries forward across whatever the caller
   * does next. Returns false (without attempting a write at all) if there
   * is no signed-in user, since autosave can never persist anything for
   * one; callers must check auth state themselves before deciding what to
   * show for that case.
   */
  readonly saveCheckpoint: () => Promise<boolean>;
} {
  const onboarding = useOnboarding();
  const { status, user } = useAuth();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fields: CreationSessionFields = {
    behaviorDirection: onboarding.behaviorDirection,
    behaviorText: onboarding.behaviorText,
    currency: onboarding.currency,
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
    successThresholdOverride: onboarding.successThresholdOverride,
  };
  const meaningfulProgress = hasMeaningfulCreationProgress(fields);
  const userId = status === 'signed_in' ? user?.id ?? null : null;
  const checkpoint = onboarding.checkpoint;

  useEffect(() => {
    if (!userId || !meaningfulProgress) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Both captured now, when the debounced write is scheduled — not when
    // the timer eventually fires. If the creation lifecycle this edit
    // belongs to has been closed (server conversion, explicit discard, or
    // leaving without saving) by the time this timer fires,
    // writeCreationSessionWorking recognizes the generation as stale and
    // skips the write, however long that takes — see
    // lib/challenge-creation/creation-session.ts's
    // creationSessionGenerations for why this can't just rely on
    // clearTimeout-on-unmount or queue position alone. The checkpoint is
    // captured the same way and carried through unchanged so a background
    // write can never create, move, or drop it — only saveCheckpoint()
    // (an explicit Save & exit) ever does that.
    const generation = currentCreationSessionGeneration(userId);
    const checkpointAtScheduleTime: CreationSessionCheckpoint | null = checkpoint;
    // Background autosave is fire-and-forget by design — a failure here is
    // not fatal, since the very next change re-arms this same debounce and
    // tries again. Only saveCheckpoint() (see below) needs to know whether
    // a save actually landed.
    timerRef.current = setTimeout(() => {
      void writeCreationSessionWorking(userId, fields, pathname, checkpointAtScheduleTime, creationSessionStorage, generation);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, meaningfulProgress, pathname, checkpoint, JSON.stringify(fields)]);

  const saveCheckpoint = async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!userId) return false;
    // An explicit, synchronous user action (Save & exit) rather than a
    // delayed timer — reading the generation fresh right now is correct,
    // there is no meaningful debounce window here to race against.
    const generation = currentCreationSessionGeneration(userId);
    const savedAt = new Date().toISOString();
    const ok = await saveCreationSessionCheckpoint(userId, fields, pathname, savedAt, creationSessionStorage, generation);
    if (ok) onboarding.setCheckpoint({ fields, lastRoute: pathname, savedAt });
    return ok;
  };

  return { fields, meaningfulProgress, saveCheckpoint };
}
