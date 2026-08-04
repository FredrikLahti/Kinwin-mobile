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
  setSitOutAcknowledged: Dispatch<SetStateAction<boolean>>;
  setStakeAmount: Dispatch<SetStateAction<number | null>>;
  setStakeAmountInput: Dispatch<SetStateAction<string>>;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
  /** Explicit mapping boundary: hydrates every onboarding field from a normalized, already-validated draft. */
  loadDraftData: (data: OnboardingDraftData, draftId: string) => void;
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
      rewardOrganizer,
      rhythm,
      savedDraftId,
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
      rewardOrganizer,
      rhythm,
      savedDraftId,
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
