import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';

export type BehaviorDirection = 'build' | 'cut' | 'stop';
export type MeasurementMode = 'completion' | 'count' | 'time' | 'amount' | 'abstinence';
export type RhythmType =
  | 'daily'
  | 'weekly_count'
  | 'specific_days'
  | 'maximum_per_period'
  | 'continuous';
export type RhythmPeriod = 'day' | 'week';
export type RhythmTimeUnit = 'minutes' | 'hours';
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type RhythmState = {
  amountUnit: string;
  period: RhythmPeriod | null;
  selectedWeekdays: Weekday[];
  targetValue: string;
  timeUnit: RhythmTimeUnit | null;
  type: RhythmType | null;
};

export type RecipientDraft = {
  id: string;
  name: string;
};

export type RewardOrganizer =
  | {
      type: 'recipient';
      recipientId: string;
    }
  | {
      type: 'other';
      name: string;
    }
  | null;

export type ExperienceCategory =
  | 'dinner'
  | 'wellness'
  | 'adventure'
  | 'culture'
  | 'getaway';

let recipientIdSequence = 0;

export function createRecipientDraft(name = ''): RecipientDraft {
  recipientIdSequence += 1;
  return {
    id: `recipient-${Date.now().toString(36)}-${recipientIdSequence.toString(36)}`,
    name,
  };
}

type ResettableOnboardingFields = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  definitionText: string;
  durationWeeks: number | null;
  experienceCategory: ExperienceCategory | null;
  goal: string;
  invitationMessage: string;
  invitationMessageCustomized: boolean;
  membershipChoice: 'monthly_trial' | null;
  measurementMode: MeasurementMode | null;
  rewardOrganizer: RewardOrganizer;
  rhythm: RhythmState;
  savedDraftId: string | null;
  /** Mirrors lib/challenge-creation/creation-session.ts's CreationSessionSnapshot.savedForLater — true only once the user has explicitly chosen Save & exit for the current in-memory session. */
  savedForLater: boolean;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
};

/**
 * The single source of truth for "no draft in progress" — used both to seed
 * every field's initial useState value and to reset back to it later (on
 * sign-out, on switching authenticated users, or when explicitly starting a
 * new draft), so the two can never drift apart.
 */
export function createInitialOnboardingFields(): ResettableOnboardingFields {
  return {
    behaviorDirection: null,
    behaviorText: '',
    definitionText: '',
    durationWeeks: null,
    experienceCategory: null,
    goal: '',
    invitationMessage: '',
    invitationMessageCustomized: false,
    membershipChoice: null,
    measurementMode: null,
    rewardOrganizer: null,
    rhythm: {
      amountUnit: '',
      period: null,
      selectedWeekdays: [],
      targetValue: '',
      timeUnit: null,
      type: null,
    },
    savedDraftId: null,
    savedForLater: false,
    sitOutAcknowledged: false,
    stakeAmount: null,
    stakeAmountInput: '',
  };
}

type OnboardingContextValue = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  currency: 'USD';
  definitionText: string;
  durationWeeks: number | null;
  experienceCategory: ExperienceCategory | null;
  goal: string;
  invitationMessage: string;
  invitationMessageCustomized: boolean;
  membershipChoice: 'monthly_trial' | null;
  measurementMode: MeasurementMode | null;
  recipients: RecipientDraft[];
  /** Clears every user-owned onboarding field back to a blank draft, including savedDraftId. */
  resetDraft: () => void;
  rewardOrganizer: RewardOrganizer;
  rhythm: RhythmState;
  savedDraftId: string | null;
  /** Mirrors CreationSessionSnapshot.savedForLater — true only once the user has explicitly chosen Save & exit (or continued a session that already was). Reset to false by resetDraft(). */
  savedForLater: boolean;
  setBehaviorDirection: (direction: BehaviorDirection | null) => void;
  setBehaviorText: (text: string) => void;
  setDefinitionText: (text: string) => void;
  setDurationWeeks: Dispatch<SetStateAction<number | null>>;
  setExperienceCategory: Dispatch<SetStateAction<ExperienceCategory | null>>;
  setGoal: (goal: string) => void;
  setInvitationMessage: Dispatch<SetStateAction<string>>;
  setInvitationMessageCustomized: Dispatch<SetStateAction<boolean>>;
  setMembershipChoice: Dispatch<SetStateAction<'monthly_trial' | null>>;
  setMeasurementMode: (mode: MeasurementMode | null) => void;
  setRecipients: Dispatch<SetStateAction<RecipientDraft[]>>;
  setRewardOrganizer: Dispatch<SetStateAction<RewardOrganizer>>;
  setRhythm: Dispatch<SetStateAction<RhythmState>>;
  setSavedDraftId: Dispatch<SetStateAction<string | null>>;
  setSavedForLater: Dispatch<SetStateAction<boolean>>;
  setSitOutAcknowledged: Dispatch<SetStateAction<boolean>>;
  setStakeAmount: Dispatch<SetStateAction<number | null>>;
  setStakeAmountInput: Dispatch<SetStateAction<string>>;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
  /** Explicit mapping boundary: hydrates every onboarding field from a normalized, already-validated draft. */
  loadDraftData: (data: OnboardingDraftData, draftId: string) => void;
  /**
   * Restores raw, possibly-incomplete fields from a local creation-session
   * snapshot (lib/challenge-creation/creation-session.ts) — deliberately
   * separate from loadDraftData, which only ever accepts an already-
   * validated, complete draft. Always clears savedDraftId to null: a
   * resumed local session is never a server draft, and any savedDraftId a
   * prior loadDraftData() call left behind must not survive into it (see
   * computeRestoredCreationSessionState).
   */
  restoreCreationSessionFields: (fields: CreationSessionFieldsInput) => void;
};

/**
 * Pure projection of what onboarding state results from restoring a local
 * creation-session snapshot — extracted so this can be unit tested
 * directly (savedDraftId must always come back null, regardless of what it
 * was before) without needing to render OnboardingProvider. savedForLater
 * always comes back true: restoring only ever happens for a session that
 * hooks/use-resumable-creation-session.ts already filtered down to an
 * explicitly-saved one (see isResumeEligibleSession) — there is no other
 * path that calls this.
 */
export function computeRestoredCreationSessionState(
  fields: CreationSessionFieldsInput,
): CreationSessionFieldsInput & { readonly savedDraftId: null; readonly savedForLater: true } {
  return { ...fields, savedDraftId: null, savedForLater: true };
}

/** Matches lib/challenge-creation/creation-session.ts's CreationSessionFields shape without importing it here, to avoid a context <-> lib circular dependency; kept structurally identical on purpose. */
type CreationSessionFieldsInput = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  definitionText: string;
  durationWeeks: number | null;
  experienceCategory: ExperienceCategory | null;
  goal: string;
  invitationMessage: string;
  invitationMessageCustomized: boolean;
  membershipChoice: 'monthly_trial' | null;
  measurementMode: MeasurementMode | null;
  recipients: readonly RecipientDraft[];
  rewardOrganizer: RewardOrganizer;
  rhythm: RhythmState;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const initialFields = createInitialOnboardingFields();
  const [goal, setGoal] = useState(initialFields.goal);
  const [behaviorDirection, setBehaviorDirection] =
    useState<BehaviorDirection | null>(initialFields.behaviorDirection);
  const [behaviorText, setBehaviorText] = useState(initialFields.behaviorText);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode | null>(initialFields.measurementMode);
  const [definitionText, setDefinitionText] = useState(initialFields.definitionText);
  const [durationWeeks, setDurationWeeks] = useState<number | null>(initialFields.durationWeeks);
  const [experienceCategory, setExperienceCategory] =
    useState<ExperienceCategory | null>(initialFields.experienceCategory);
  const [invitationMessage, setInvitationMessage] = useState(initialFields.invitationMessage);
  const [invitationMessageCustomized, setInvitationMessageCustomized] = useState(initialFields.invitationMessageCustomized);
  const [membershipChoice, setMembershipChoice] = useState<'monthly_trial' | null>(initialFields.membershipChoice);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => [
    createRecipientDraft(),
  ]);
  const [rewardOrganizer, setRewardOrganizer] = useState<RewardOrganizer>(initialFields.rewardOrganizer);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(initialFields.savedDraftId);
  const [savedForLater, setSavedForLater] = useState(initialFields.savedForLater);
  const [sitOutAcknowledged, setSitOutAcknowledged] = useState(initialFields.sitOutAcknowledged);
  const [stakeAmount, setStakeAmount] = useState<number | null>(initialFields.stakeAmount);
  const [stakeAmountInput, setStakeAmountInput] = useState(initialFields.stakeAmountInput);
  const [rhythm, setRhythm] = useState<RhythmState>(initialFields.rhythm);

  const loadDraftData = useCallback((data: OnboardingDraftData, draftId: string) => {
    setGoal(data.goal);
    setBehaviorText(data.behaviorText);
    setDefinitionText(data.definitionText);
    setBehaviorDirection(data.behaviorDirection);
    setMeasurementMode(data.measurementMode);
    setRhythm({ ...data.rhythm, selectedWeekdays: [...data.rhythm.selectedWeekdays] });
    setDurationWeeks(data.durationWeeks);
    setRecipients(data.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name })));
    setRewardOrganizer(data.rewardOrganizer);
    setExperienceCategory(data.experienceCategory);
    setStakeAmount(data.stakeAmount);
    setStakeAmountInput(data.stakeAmount !== null ? String(data.stakeAmount) : '');
    setSitOutAcknowledged(data.sitOutAcknowledged);
    setInvitationMessage(data.invitationMessage);
    setInvitationMessageCustomized(true);
    setMembershipChoice(data.membershipChoice);
    setSavedDraftId(draftId);
    // A loaded server draft is a different entity from any local creation-
    // session snapshot — never let a leftover savedForLater: true from an
    // earlier, unrelated local session make background autosave on this
    // draft's fields look like it was explicitly saved for later too.
    setSavedForLater(false);
  }, []);

  const resetDraft = useCallback(() => {
    const fields = createInitialOnboardingFields();
    setGoal(fields.goal);
    setBehaviorText(fields.behaviorText);
    setDefinitionText(fields.definitionText);
    setBehaviorDirection(fields.behaviorDirection);
    setMeasurementMode(fields.measurementMode);
    setRhythm(fields.rhythm);
    setDurationWeeks(fields.durationWeeks);
    setRecipients([createRecipientDraft()]);
    setRewardOrganizer(fields.rewardOrganizer);
    setExperienceCategory(fields.experienceCategory);
    setStakeAmount(fields.stakeAmount);
    setStakeAmountInput(fields.stakeAmountInput);
    setSitOutAcknowledged(fields.sitOutAcknowledged);
    setInvitationMessage(fields.invitationMessage);
    setInvitationMessageCustomized(fields.invitationMessageCustomized);
    setMembershipChoice(fields.membershipChoice);
    setSavedDraftId(fields.savedDraftId);
    setSavedForLater(fields.savedForLater);
  }, []);

  const restoreCreationSessionFields = useCallback((fields: CreationSessionFieldsInput) => {
    const restored = computeRestoredCreationSessionState(fields);
    setGoal(restored.goal);
    setBehaviorText(restored.behaviorText);
    setDefinitionText(restored.definitionText);
    setBehaviorDirection(restored.behaviorDirection);
    setMeasurementMode(restored.measurementMode);
    setRhythm({ ...restored.rhythm, selectedWeekdays: [...restored.rhythm.selectedWeekdays] });
    setDurationWeeks(restored.durationWeeks);
    setRecipients(restored.recipients.length > 0 ? restored.recipients.map((recipient) => ({ ...recipient })) : [createRecipientDraft()]);
    setRewardOrganizer(restored.rewardOrganizer);
    setExperienceCategory(restored.experienceCategory);
    setStakeAmount(restored.stakeAmount);
    setStakeAmountInput(restored.stakeAmountInput);
    setSitOutAcknowledged(restored.sitOutAcknowledged);
    setInvitationMessage(restored.invitationMessage);
    setInvitationMessageCustomized(restored.invitationMessageCustomized);
    setMembershipChoice(restored.membershipChoice);
    // A resumed local session is never a server draft — explicitly clear
    // any savedDraftId a prior loadDraftData() call may have set, so
    // Review can never carry a stale server draft identity into
    // saveChallengeDraft's existingDraftId for fields that actually came
    // from this unrelated local session.
    setSavedDraftId(restored.savedDraftId);
    setSavedForLater(restored.savedForLater);
  }, []);

  const value = useMemo(
    () => ({
      behaviorDirection,
      behaviorText,
      currency: 'USD' as const,
      definitionText,
      durationWeeks,
      experienceCategory,
      goal,
      invitationMessage,
      invitationMessageCustomized,
      loadDraftData,
      membershipChoice,
      measurementMode,
      recipients,
      resetDraft,
      restoreCreationSessionFields,
      rewardOrganizer,
      rhythm,
      savedDraftId,
      savedForLater,
      setBehaviorDirection,
      setBehaviorText,
      setDefinitionText,
      setDurationWeeks,
      setExperienceCategory,
      setGoal,
      setInvitationMessage,
      setInvitationMessageCustomized,
      setMembershipChoice,
      setMeasurementMode,
      setRecipients,
      setRewardOrganizer,
      setRhythm,
      setSavedDraftId,
      setSavedForLater,
      setSitOutAcknowledged,
      setStakeAmount,
      setStakeAmountInput,
      sitOutAcknowledged,
      stakeAmount,
      stakeAmountInput,
    }),
    [
      behaviorDirection,
      behaviorText,
      definitionText,
      durationWeeks,
      experienceCategory,
      goal,
      invitationMessage,
      invitationMessageCustomized,
      loadDraftData,
      membershipChoice,
      measurementMode,
      recipients,
      resetDraft,
      restoreCreationSessionFields,
      rewardOrganizer,
      rhythm,
      savedDraftId,
      savedForLater,
      sitOutAcknowledged,
      stakeAmount,
      stakeAmountInput,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }

  return context;
}
