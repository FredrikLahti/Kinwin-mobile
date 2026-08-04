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
  const [goal, setGoal] = useState('');
  const [behaviorDirection, setBehaviorDirection] =
    useState<BehaviorDirection | null>(null);
  const [behaviorText, setBehaviorText] = useState('');
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode | null>(null);
  const [definitionText, setDefinitionText] = useState('');
  const [durationWeeks, setDurationWeeks] = useState<number | null>(null);
  const [experienceCategory, setExperienceCategory] =
    useState<ExperienceCategory | null>(null);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [invitationMessageCustomized, setInvitationMessageCustomized] = useState(false);
  const [membershipChoice, setMembershipChoice] = useState<'monthly_trial' | null>(null);
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => [
    createRecipientDraft(),
  ]);
  const [rewardOrganizer, setRewardOrganizer] = useState<RewardOrganizer>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [sitOutAcknowledged, setSitOutAcknowledged] = useState(false);
  const [stakeAmount, setStakeAmount] = useState<number | null>(null);
  const [stakeAmountInput, setStakeAmountInput] = useState('');
  const [rhythm, setRhythm] = useState<RhythmState>({
    amountUnit: '',
    period: null,
    selectedWeekdays: [],
    targetValue: '',
    timeUnit: null,
    type: null,
  });

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
