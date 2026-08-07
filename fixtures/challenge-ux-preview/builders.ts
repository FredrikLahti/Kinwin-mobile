// Typed fixture builders for the /challenge-ux-preview prototype. Mirrors
// the builder pattern already used in domain/challenge/results.test.ts and
// domain/challenge/check-in/period-state.test.ts — real domain input shapes,
// nothing UI-only. Every scenario in ./scenarios.ts is assembled from these.

// Relative imports (not `@/`) — see the note in lib/challenge-ux-preview/view-model.ts.
import { ChallengePeriod, ChallengePeriodKind, PeriodTarget } from '../../domain/challenge/periods';
import { CheckInEvent, CheckInEventType, CheckInFact, CheckInSource, ClientOperationId } from '../../domain/challenge/check-in/types';
import {
  ActivatedChallengeSnapshot,
  ChallengeId,
  ChallengePeriodId,
  ChallengeRule,
  ConsequenceId,
  CheckInId,
  IsoDateTime,
  Measurement,
  RecipientId,
  SuccessRuleSnapshot,
  UserId,
} from '../../domain/challenge/types';

export const CHALLENGE_ID = 'ux-preview-challenge' as ChallengeId;
export const OWNER_ID = 'ux-preview-owner' as UserId;

export function ruleFor(successRule: SuccessRuleSnapshot, cutBackUnit: string): ChallengeRule {
  switch (successRule.direction) {
    case 'build':
      return {
        direction: 'build',
        measurement: { type: 'completion', unit: 'completion' },
        rhythm: successRule.periodUnit === 'day'
          ? { type: 'daily', periodUnit: 'day', target: 1 }
          : { type: 'weekly_count', periodUnit: 'week', target: successRule.periodTarget },
      };
    case 'cut_back': {
      const measurement: Extract<Measurement, { type: 'count' | 'time' | 'amount' }> = successRule.measurementType === 'count'
        ? { type: 'count', unit: cutBackUnit }
        : successRule.measurementType === 'time'
        ? { type: 'time', unit: 'minutes' }
        : { type: 'amount', unit: cutBackUnit };
      return { direction: 'cut_back', measurement, boundary: { periodUnit: successRule.periodUnit, maximumValue: successRule.maximumAllowedValue } };
    }
    case 'stop':
      return {
        direction: 'stop',
        measurement: { type: 'abstinence', unit: 'lapse' },
        boundary: { periodUnit: 'challenge', maximumLapses: 0 },
      };
  }
}

export function buildChallenge(options: {
  readonly goal: string;
  readonly behaviorDescription: string;
  readonly completionDefinition: string;
  readonly successRule: SuccessRuleSnapshot;
  readonly startsAt: IsoDateTime;
  readonly plannedEndsAt: IsoDateTime;
  readonly recipientName?: string;
  readonly stakeMinorUnits?: number;
  readonly cutBackUnit?: string;
}): ActivatedChallengeSnapshot {
  return {
    schemaVersion: 1,
    id: CHALLENGE_ID,
    draftId: 'ux-preview-draft' as ActivatedChallengeSnapshot['draftId'],
    consequenceId: 'ux-preview-consequence' as ConsequenceId,
    ownerId: OWNER_ID,
    activatedAt: options.startsAt,
    timezone: 'UTC' as ActivatedChallengeSnapshot['timezone'],
    startsAt: options.startsAt,
    plannedEndsAt: options.plannedEndsAt,
    goal: options.goal,
    behavior: { description: options.behaviorDescription, completionDefinition: options.completionDefinition, rule: ruleFor(options.successRule, options.cutBackUnit ?? 'items') },
    duration: { unit: 'week', value: 1 },
    successRule: options.successRule,
    recipients: [{ id: 'ux-preview-recipient' as RecipientId, name: options.recipientName ?? 'Mom', invitationId: null }],
    rewardOrganizer: { type: 'other', name: options.recipientName ?? 'Mom' },
    consequenceCategory: 'dinner',
    stake: { minorUnits: options.stakeMinorUnits ?? 5000, currency: 'USD' as ActivatedChallengeSnapshot['stake']['currency'] },
    sitOutAcknowledged: true,
    membershipStatusAtActivation: 'active',
    status: 'active',
    ruleEngineVersion: 1,
  };
}

let periodSequence = 0;
export function buildPeriod(options: {
  readonly periodNumber?: number;
  readonly periodKind: ChallengePeriodKind;
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly reportingClosesAt: IsoDateTime;
  readonly target: PeriodTarget;
}): ChallengePeriod {
  periodSequence += 1;
  return {
    schemaVersion: 1,
    id: `ux-preview-period-${periodSequence}` as ChallengePeriodId,
    challengeId: CHALLENGE_ID,
    periodNumber: options.periodNumber ?? periodSequence,
    periodKind: options.periodKind,
    startsAt: options.startsAt,
    endsAt: options.endsAt,
    reportingClosesAt: options.reportingClosesAt,
    target: options.target,
  };
}

let eventSequence = 0;
export function buildEvent(options: {
  readonly periodId: ChallengePeriodId;
  readonly eventType: CheckInEventType;
  readonly fact: CheckInFact;
  readonly correctionOfEventId?: CheckInId;
  readonly clientRecordedAt: IsoDateTime;
  readonly serverRecordedAt?: IsoDateTime | null;
  readonly source?: CheckInSource;
  readonly operationId?: ClientOperationId | null;
}): CheckInEvent {
  eventSequence += 1;
  return {
    schemaVersion: 1,
    id: `ux-preview-event-${eventSequence}` as CheckInId,
    challengeId: CHALLENGE_ID,
    ownerId: OWNER_ID,
    periodId: options.periodId,
    source: options.source ?? 'ios',
    clientRecordedAt: options.clientRecordedAt,
    serverRecordedAt: options.serverRecordedAt === undefined ? options.clientRecordedAt : options.serverRecordedAt,
    operationId: options.operationId ?? (`ux-preview-op-${eventSequence}` as ClientOperationId),
    ...(options.eventType === 'correction'
      ? { eventType: 'correction' as const, correctionOfEventId: options.correctionOfEventId!, fact: options.fact }
      : { eventType: options.eventType, fact: options.fact }),
  } as CheckInEvent;
}

export function nextOperationId(): ClientOperationId {
  eventSequence += 1;
  return `ux-preview-runtime-op-${eventSequence}-${Date.now()}` as ClientOperationId;
}
