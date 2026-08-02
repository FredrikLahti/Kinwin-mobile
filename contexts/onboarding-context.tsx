import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from 'react';

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
  measurementMode: MeasurementMode | null;
  recipients: RecipientDraft[];
  rewardOrganizer: RewardOrganizer;
  rhythm: RhythmState;
  setBehaviorDirection: (direction: BehaviorDirection | null) => void;
  setBehaviorText: (text: string) => void;
  setDefinitionText: (text: string) => void;
  setDurationWeeks: Dispatch<SetStateAction<number | null>>;
  setExperienceCategory: Dispatch<SetStateAction<ExperienceCategory | null>>;
  setGoal: (goal: string) => void;
  setMeasurementMode: (mode: MeasurementMode | null) => void;
  setRecipients: Dispatch<SetStateAction<RecipientDraft[]>>;
  setRewardOrganizer: Dispatch<SetStateAction<RewardOrganizer>>;
  setRhythm: Dispatch<SetStateAction<RhythmState>>;
  setSitOutAcknowledged: Dispatch<SetStateAction<boolean>>;
  setStakeAmount: Dispatch<SetStateAction<number | null>>;
  setStakeAmountInput: Dispatch<SetStateAction<string>>;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
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
  const [recipients, setRecipients] = useState<RecipientDraft[]>(() => [
    createRecipientDraft(),
  ]);
  const [rewardOrganizer, setRewardOrganizer] = useState<RewardOrganizer>(null);
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

  const value = useMemo(
    () => ({
      behaviorDirection,
      behaviorText,
      currency: 'USD' as const,
      definitionText,
      durationWeeks,
      experienceCategory,
      goal,
      measurementMode,
      recipients,
      rewardOrganizer,
      rhythm,
      setBehaviorDirection,
      setBehaviorText,
      setDefinitionText,
      setDurationWeeks,
      setExperienceCategory,
      setGoal,
      setMeasurementMode,
      setRecipients,
      setRewardOrganizer,
      setRhythm,
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
      measurementMode,
      recipients,
      rewardOrganizer,
      rhythm,
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
