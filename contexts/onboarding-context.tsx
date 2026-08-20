import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';
import type { SupportedCurrency } from '@/domain/challenge/currency';
// Relative, not '@/...': this file is required at plain-`node --test` time
// by several *.test.ts files (creation-session.test.ts, navigation-
// action.test.ts, onboarding-context.test.ts itself), which have no
// path-alias resolution — only Metro (the real app bundler) understands
// '@/...'. A '@/...' import of any real VALUE (not a type, which tsc
// elides entirely) here breaks every one of those tests at runtime. This
// module deliberately does NOT import contexts/auth-context.tsx for the
// same reason, one level worse: auth-context.tsx itself pulls in the real
// Supabase client and several more '@/lib/...' modules never otherwise
// exercised by this test harness — see AuthGate in app/_layout.tsx, the
// one place that legitimately already has both useAuth() and
// useOnboarding() in scope, for where the actual profile-currency lookup
// belongs; this file only exposes applyDefaultCurrencyIfUntouched() below
// for it to call.
import { resolveDefaultCurrency } from '../lib/challenge-creation/currency-default';

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

/**
 * Mirrors lib/challenge-creation/creation-session.ts's
 * CreationSessionCheckpoint exactly (including savedAt) — set only by a
 * successful explicit Save & exit, or by restoring an already-
 * checkpointed session. Background autosave must never set this; it only
 * ever writes the separate "working" crash-recovery state, and must carry
 * this exact value through unchanged so a checkpoint's savedAt only ever
 * moves when a *new* explicit save actually happens, never as a side
 * effect of an unrelated background write.
 */
type OnboardingSessionCheckpoint = {
  fields: CreationSessionFieldsInput;
  lastRoute: string;
  savedAt: string;
};

type ResettableOnboardingFields = {
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  checkpoint: OnboardingSessionCheckpoint | null;
  currency: SupportedCurrency;
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
  successThresholdOverride: number | null;
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
    checkpoint: null,
    currency: 'USD',
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
    successThresholdOverride: null,
  };
}

type OnboardingContextValue = {
  /** Applies the resolved default currency (saved preference, else device locale) to the current draft, but ONLY if it hasn't been explicitly touched yet — see the fresh-draft-default boundary comment above OnboardingProvider's currencyTouchedRef. Called from AuthGate (app/_layout.tsx), which has the profile this context deliberately does not import. */
  applyDefaultCurrencyIfUntouched: (preferredCurrency: SupportedCurrency | null, locale?: string) => void;
  behaviorDirection: BehaviorDirection | null;
  behaviorText: string;
  /** The explicit resume checkpoint — null unless the current session was explicitly Saved & exited (or Continued from one). See OnboardingSessionCheckpoint. Reset to null by resetDraft() and loadDraftData(). */
  checkpoint: OnboardingSessionCheckpoint | null;
  currency: SupportedCurrency;
  definitionText: string;
  durationWeeks: number | null;
  experienceCategory: ExperienceCategory | null;
  /** Bumped by every resetDraft() call — exists only so AuthGate's fresh-draft-default effect has something to depend on that changes even when the saved preference itself hasn't. Not meaningful for anything else. */
  freshDraftToken: number;
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
  setCheckpoint: Dispatch<SetStateAction<OnboardingSessionCheckpoint | null>>;
  /** Marks the draft's currency as explicitly chosen — see applyDefaultCurrencyIfUntouched above — so it is never afterward overwritten by a saved-preference/locale default. */
  setCurrency: (value: SupportedCurrency) => void;
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
  setSuccessThresholdOverride: Dispatch<SetStateAction<number | null>>;
  sitOutAcknowledged: boolean;
  stakeAmount: number | null;
  stakeAmountInput: string;
  /** Success Means: the user's selected overall minimum, or null to use Kinwin's baseline. See domain/challenge/from-onboarding-draft.ts's OnboardingDraftData.successThresholdOverride. */
  successThresholdOverride: number | null;
  /** Explicit mapping boundary: hydrates every onboarding field from a normalized, already-validated draft. */
  loadDraftData: (data: OnboardingDraftData, draftId: string) => void;
  /**
   * Restores raw, possibly-incomplete fields (and their route) from a
   * local creation-session checkpoint
   * (lib/challenge-creation/creation-session.ts) — deliberately separate
   * from loadDraftData, which only ever accepts an already-validated,
   * complete draft. Always clears savedDraftId to null: a resumed local
   * session is never a server draft, and any savedDraftId a prior
   * loadDraftData() call left behind must not survive into it. Sets
   * `checkpoint` to exactly what's being restored, since restoring only
   * ever happens for an already-checkpointed session (see
   * computeRestoredCreationSessionState).
   */
  restoreCreationSessionFields: (fields: CreationSessionFieldsInput, lastRoute: string, savedAt: string) => void;
};

/**
 * A duration outside [2, 12] whole weeks can never be produced by any
 * current live control (app/create/duration.tsx's presets and custom
 * stepper both clamp to this range), but neither restore boundary below
 * re-validates the range of a persisted or server-loaded value before
 * putting it back into onboarding state — only its *type* is checked
 * upstream (lib/challenge-creation/creation-session.ts's
 * isFiniteNumberOrNull for a local checkpoint; nothing at all for a
 * resumed server draft's raw duration.value, see
 * domain/challenge/to-onboarding-draft.ts). A stale, corrupted, or
 * otherwise out-of-range persisted value would otherwise land the user on
 * Duration with a value Continue can never accept and no visible reason
 * why. Nulled rather than clamped: silently turning a persisted "1" into
 * "2" would misrepresent a choice the user never actually made, whereas
 * null is the same "nothing chosen yet" state a brand-new visit to this
 * step already handles correctly, with every control still live.
 */
function sanitizeDurationWeeks(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 2 && value <= 12 ? value : null;
}

/**
 * Same "null rather than clamp" philosophy as sanitizeDurationWeeks, for
 * the same reason: this only rejects a structurally corrupt persisted
 * value (not an integer, not positive). It deliberately does NOT bounds-
 * check against the current baseline/total — those depend on duration and
 * rhythm, which the Success Means screen (via
 * domain/challenge/success-rule.ts's clampSuccessThreshold) is what
 * actually re-derives and clamps into range whenever upstream inputs
 * change. Nulling a merely-stale-but-structurally-valid value here would
 * incorrectly discard a still-restorable stricter intent.
 */
function sanitizeSuccessThresholdOverride(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Pure projection of what onboarding state results from restoring a local
 * creation-session checkpoint — extracted so this can be unit tested
 * directly (savedDraftId must always come back null, regardless of what it
 * was before) without needing to render OnboardingProvider. The restored
 * checkpoint always mirrors exactly the fields/lastRoute being restored:
 * restoring only ever happens for a session that
 * hooks/use-resumable-creation-session.ts already filtered down to an
 * explicitly-saved one (see isResumeEligibleSession) — there is no other
 * path that calls this — so what's being restored *is* the checkpoint.
 * durationWeeks is sanitized before either the live fields or the stored
 * checkpoint are built from it — never only on the live side — so a
 * resumed session's own "unsaved changes since last save" comparison
 * never sees a false diff between the two the instant it opens.
 */
export function computeRestoredCreationSessionState(
  rawFields: CreationSessionFieldsInput,
  lastRoute: string,
  savedAt: string,
): CreationSessionFieldsInput & {
  readonly savedDraftId: null;
  readonly checkpoint: { readonly fields: CreationSessionFieldsInput; readonly lastRoute: string; readonly savedAt: string };
} {
  const fields = {
    ...rawFields,
    durationWeeks: sanitizeDurationWeeks(rawFields.durationWeeks),
    successThresholdOverride: sanitizeSuccessThresholdOverride(rawFields.successThresholdOverride),
  };
  return { ...fields, savedDraftId: null, checkpoint: { fields, lastRoute, savedAt } };
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
  successThresholdOverride: number | null;
  currency: SupportedCurrency;
};

/**
 * The pure decision at the heart of OnboardingProvider's fresh-draft-
 * default effect — extracted so it is directly unit-testable without
 * rendering React (this repo's test harness is plain `node --test` over
 * pure functions, with no React renderer — see contexts/onboarding-
 * context.test.ts). Returns the currency to apply, or null to mean
 * "leave it alone" (the draft has already been explicitly touched — by
 * the user picking one, or by loading/restoring a real persisted draft's
 * own currency — see OnboardingProvider's currencyTouchedRef). Never
 * derives from anything except the two inputs: no live FX, no other
 * onboarding state.
 */
export function resolveFreshDraftCurrencyUpdate(
  touched: boolean,
  preferredCurrency: SupportedCurrency | null,
  locale?: string,
): SupportedCurrency | null {
  if (touched) return null;
  return resolveDefaultCurrency(preferredCurrency, locale);
}

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
  const [checkpoint, setCheckpoint] = useState<OnboardingSessionCheckpoint | null>(initialFields.checkpoint);
  const [currency, setCurrency] = useState<SupportedCurrency>(initialFields.currency);
  const [sitOutAcknowledged, setSitOutAcknowledged] = useState(initialFields.sitOutAcknowledged);
  const [stakeAmount, setStakeAmount] = useState<number | null>(initialFields.stakeAmount);
  const [stakeAmountInput, setStakeAmountInput] = useState(initialFields.stakeAmountInput);
  const [rhythm, setRhythm] = useState<RhythmState>(initialFields.rhythm);
  const [successThresholdOverride, setSuccessThresholdOverride] = useState<number | null>(initialFields.successThresholdOverride);

  // True multi-currency V1's ONE fresh-draft-default boundary: every place
  // in the app that starts, resets, loads, or restores a draft funnels
  // through the state setters below — this ref plus applyDefaultCurrency
  // IfUntouched (called from AuthGate in app/_layout.tsx, the one place
  // that already legitimately has both useAuth() and useOnboarding() in
  // scope — this module deliberately does not import auth-context.tsx
  // itself, see the import comment above) is what applies the default
  // currency (saved preference, else device locale — see
  // resolveDefaultCurrency) to a genuinely blank draft, regardless of
  // which of those several call sites (or a fresh cold app launch that
  // calls none of them, e.g. app/index.tsx's signed-out "Start challenge")
  // got there. Never a per-screen resolveDefaultCurrency() call, so no
  // fresh-start path can be missed by forgetting to call it. `false`
  // (untouched) means "this blank draft is still eligible for the
  // default"; ANY explicit currency set — from the user picking one on
  // the stake screen, or from loading/restoring a real persisted draft's
  // own already-chosen currency — permanently disqualifies it until the
  // next resetDraft(), so a saved preference change can never silently
  // rewrite an in-progress or resumed draft's currency. freshDraftToken
  // exists only so AuthGate's effect has something to depend on that
  // changes on every resetDraft() call even when the saved preference
  // itself hasn't (resetDraft() alone doesn't otherwise change anything
  // AuthGate's effect could depend on).
  const currencyTouchedRef = useRef(false);
  const [freshDraftToken, setFreshDraftToken] = useState(0);

  const setCurrencyExplicit = useCallback((value: SupportedCurrency) => {
    currencyTouchedRef.current = true;
    setCurrency(value);
  }, []);

  const applyDefaultCurrencyIfUntouched = useCallback((preferredCurrency: SupportedCurrency | null, locale?: string) => {
    const next = resolveFreshDraftCurrencyUpdate(currencyTouchedRef.current, preferredCurrency, locale);
    if (next !== null) setCurrency(next);
  }, []);

  const loadDraftData = useCallback((data: OnboardingDraftData, draftId: string) => {
    setGoal(data.goal);
    setBehaviorText(data.behaviorText);
    setDefinitionText(data.definitionText);
    setBehaviorDirection(data.behaviorDirection);
    setMeasurementMode(data.measurementMode);
    // A loaded server draft's currency is already the real, immutable-once-
    // prepared commitment currency — never eligible for the fresh-draft
    // default effect above to overwrite.
    currencyTouchedRef.current = true;
    setCurrency(data.currency as SupportedCurrency);
    setRhythm({ ...data.rhythm, selectedWeekdays: [...data.rhythm.selectedWeekdays] });
    // A resumed server draft's raw duration.value is never re-validated
    // between the database and here (domain/challenge/to-onboarding-draft.ts
    // is a plain passthrough) — sanitize the same way a restored local
    // checkpoint is, so an out-of-range value can never land the user on
    // Duration with nothing they can do about it.
    setDurationWeeks(sanitizeDurationWeeks(data.durationWeeks));
    setSuccessThresholdOverride(sanitizeSuccessThresholdOverride(data.successThresholdOverride));
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
    // session checkpoint — never let a leftover checkpoint from an
    // earlier, unrelated local session make background autosave on this
    // draft's fields look like it belongs to that checkpoint too.
    setCheckpoint(null);
  }, []);

  const resetDraft = useCallback(() => {
    const fields = createInitialOnboardingFields();
    setGoal(fields.goal);
    setBehaviorText(fields.behaviorText);
    setDefinitionText(fields.definitionText);
    setBehaviorDirection(fields.behaviorDirection);
    setMeasurementMode(fields.measurementMode);
    // The single reset baseline currency ('USD') is only ever a transient
    // starting point here — clearing `touched` (and bumping the token to
    // re-trigger the fresh-draft-default effect above, since resetDraft()
    // alone doesn't otherwise change that effect's own dependencies) is
    // what lets the next real default (saved preference, else locale)
    // actually apply, for every resetDraft() call site alike.
    currencyTouchedRef.current = false;
    setCurrency(fields.currency);
    setFreshDraftToken((token) => token + 1);
    setRhythm(fields.rhythm);
    setDurationWeeks(fields.durationWeeks);
    setSuccessThresholdOverride(fields.successThresholdOverride);
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
    setCheckpoint(fields.checkpoint);
  }, []);

  const restoreCreationSessionFields = useCallback((fields: CreationSessionFieldsInput, lastRoute: string, savedAt: string) => {
    const restored = computeRestoredCreationSessionState(fields, lastRoute, savedAt);
    setGoal(restored.goal);
    setBehaviorText(restored.behaviorText);
    setDefinitionText(restored.definitionText);
    setBehaviorDirection(restored.behaviorDirection);
    setMeasurementMode(restored.measurementMode);
    // A restored local checkpoint's currency is the user's own already-made
    // choice — never eligible for the fresh-draft default effect to
    // overwrite (see loadDraftData's identical reasoning above).
    currencyTouchedRef.current = true;
    setCurrency(restored.currency);
    setRhythm({ ...restored.rhythm, selectedWeekdays: [...restored.rhythm.selectedWeekdays] });
    setDurationWeeks(restored.durationWeeks);
    setSuccessThresholdOverride(restored.successThresholdOverride);
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
    setCheckpoint(restored.checkpoint);
  }, []);

  const value = useMemo(
    () => ({
      applyDefaultCurrencyIfUntouched,
      behaviorDirection,
      behaviorText,
      checkpoint,
      currency,
      definitionText,
      durationWeeks,
      experienceCategory,
      freshDraftToken,
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
      setBehaviorDirection,
      setBehaviorText,
      setCheckpoint,
      setCurrency: setCurrencyExplicit,
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
      setSuccessThresholdOverride,
      sitOutAcknowledged,
      stakeAmount,
      stakeAmountInput,
      successThresholdOverride,
    }),
    [
      applyDefaultCurrencyIfUntouched,
      behaviorDirection,
      behaviorText,
      checkpoint,
      currency,
      definitionText,
      durationWeeks,
      experienceCategory,
      freshDraftToken,
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
      setCurrencyExplicit,
      sitOutAcknowledged,
      stakeAmount,
      stakeAmountInput,
      successThresholdOverride,
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
