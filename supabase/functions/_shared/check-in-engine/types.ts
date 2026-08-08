// Verbatim copy of domain/challenge/types.ts for the Deno edge-function runtime boundary
// (Deno requires explicit .ts extensions on relative imports; Metro/tsc
// resolve extensionless ones, so the source of truth can't be imported
// directly). Only change from the source: added '.ts' to relative
// imports below. Keep byte-identical otherwise -- do not hand-edit logic
// here; change domain/challenge/check-in instead and re-copy.
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type UserId = Brand<string, 'UserId'>;
export type ChallengeId = Brand<string, 'ChallengeId'>;
export type ChallengeDraftId = Brand<string, 'ChallengeDraftId'>;
export type RecipientId = Brand<string, 'RecipientId'>;
export type InvitationId = Brand<string, 'InvitationId'>;
export type CheckInId = Brand<string, 'CheckInId'>;
export type ChallengePeriodId = Brand<string, 'ChallengePeriodId'>;
export type ConsequenceId = Brand<string, 'ConsequenceId'>;
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
export type TimeZoneId = Brand<string, 'TimeZoneId'>;
export type CurrencyCode = Brand<string, 'CurrencyCode'>;

export type PeriodUnit = 'day' | 'week' | 'challenge';
export type ChallengeStatus =
  | 'pending_activation'
  | 'active'
  | 'completion_mode'
  | 'completed_success'
  | 'completed_failure'
  | 'canceled_before_activation';

export type Measurement =
  | { readonly type: 'completion'; readonly unit: 'completion' }
  | { readonly type: 'count'; readonly unit: string }
  | { readonly type: 'time'; readonly unit: 'minutes' | 'hours' }
  | { readonly type: 'amount'; readonly unit: string }
  | { readonly type: 'abstinence'; readonly unit: 'lapse' };

export type ChallengeRule =
  | {
      readonly direction: 'build';
      readonly measurement: Extract<Measurement, { type: 'completion' }>;
      readonly rhythm:
        | { readonly type: 'daily'; readonly periodUnit: 'day'; readonly target: 1 }
        | { readonly type: 'weekly_count'; readonly periodUnit: 'week'; readonly target: number }
        | { readonly type: 'specific_days'; readonly periodUnit: 'week'; readonly weekdays: readonly Weekday[]; readonly target: number };
    }
  | {
      readonly direction: 'cut_back';
      readonly measurement: Extract<Measurement, { type: 'count' | 'time' | 'amount' }>;
      readonly boundary: { readonly periodUnit: Exclude<PeriodUnit, 'challenge'>; readonly maximumValue: number };
    }
  | {
      readonly direction: 'stop';
      readonly measurement: Extract<Measurement, { type: 'abstinence' }>;
      readonly boundary: { readonly periodUnit: 'challenge'; readonly maximumLapses: number };
    };

export type SuccessRuleSnapshot =
  | {
      readonly direction: 'build';
      readonly ruleVersion: 1;
      readonly totalPlannedCompletions: number;
      readonly minimumRequiredCompletions: number;
      readonly continuitySafeguard:
        | { readonly type: 'maximum_consecutive_missed_days'; readonly maximum: 2 }
        | { readonly type: 'minimum_completions_per_week'; readonly minimum: number }
        | { readonly type: 'maximum_consecutive_missed_weeks'; readonly maximum: 1 };
      readonly periodTarget: number;
      readonly periodUnit: Exclude<PeriodUnit, 'challenge'>;
    }
  | {
      readonly direction: 'cut_back';
      readonly ruleVersion: 1;
      readonly measurementType: 'count' | 'time' | 'amount';
      readonly maximumAllowedValue: number;
      readonly periodUnit: Exclude<PeriodUnit, 'challenge'>;
      readonly totalPeriods: number;
      readonly minimumPeriodsWithinLimit: number;
      readonly continuitySafeguard:
        | { readonly type: 'maximum_consecutive_exceeded_days'; readonly maximum: 2 }
        | { readonly type: 'maximum_consecutive_exceeded_weeks'; readonly maximum: 1 };
    }
  | {
      readonly direction: 'stop';
      readonly ruleVersion: 1;
      readonly lapseRule: { readonly type: 'zero_lapses' } | { readonly type: 'allowance'; readonly maximumLapses: number };
    };

export type ChallengeRecipient = {
  readonly id: RecipientId;
  readonly name: string;
  readonly invitationId: InvitationId | null;
};

export type RewardOrganizer =
  | { readonly type: 'recipient'; readonly recipientId: RecipientId }
  | { readonly type: 'other'; readonly name: string };

export type ExperienceCategory = 'adventure' | 'culture' | 'dinner' | 'getaway' | 'wellness';
export type MembershipSelection = 'monthly_trial';
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type ChallengeDraft = {
  readonly schemaVersion: 1;
  readonly id: ChallengeDraftId;
  readonly ownerId: UserId;
  readonly goal: string;
  readonly behavior: { readonly description: string; readonly completionDefinition: string; readonly rule: ChallengeRule };
  readonly duration: { readonly unit: 'week'; readonly value: number };
  readonly successRule: SuccessRuleSnapshot;
  readonly recipients: readonly ChallengeRecipient[];
  readonly rewardOrganizer: RewardOrganizer | null;
  readonly experienceCategory: ExperienceCategory | null;
  readonly stake: { readonly minorUnits: number; readonly currency: CurrencyCode };
  readonly sitOutAcknowledged: boolean;
  readonly invitationMessage: string;
  readonly membershipSelection: MembershipSelection | null;
};

export type ActivatedChallengeSnapshot = {
  readonly schemaVersion: 1;
  readonly id: ChallengeId;
  readonly draftId: ChallengeDraftId;
  readonly consequenceId: ConsequenceId;
  readonly ownerId: UserId;
  readonly activatedAt: IsoDateTime;
  readonly timezone: TimeZoneId;
  readonly startsAt: IsoDateTime;
  readonly plannedEndsAt: IsoDateTime;
  readonly goal: string;
  readonly behavior: { readonly description: string; readonly completionDefinition: string; readonly rule: ChallengeRule };
  readonly duration: { readonly unit: 'week'; readonly value: number };
  readonly successRule: SuccessRuleSnapshot;
  readonly recipients: readonly ChallengeRecipient[];
  readonly rewardOrganizer: RewardOrganizer;
  readonly consequenceCategory: ExperienceCategory;
  readonly stake: { readonly minorUnits: number; readonly currency: CurrencyCode };
  readonly sitOutAcknowledged: true;
  readonly membershipStatusAtActivation: 'trialing' | 'active' | 'grace_period' | 'canceled_pending_expiry';
  readonly status: ChallengeStatus;
  readonly ruleEngineVersion: 1;
};
