import { ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, Measurement, PeriodUnit, UserId } from './types';

export type PeriodTarget =
  | { readonly type: 'completion_target'; readonly target: number }
  | { readonly type: 'maximum_value'; readonly maximum: number; readonly measurement: Measurement }
  | { readonly type: 'maximum_lapses'; readonly maximum: number };

export type ChallengePeriod = {
  readonly schemaVersion: 1;
  readonly id: ChallengePeriodId;
  readonly challengeId: ChallengeId;
  readonly periodNumber: number;
  readonly unit: PeriodUnit;
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly target: PeriodTarget;
  readonly computedStatus: 'pending' | 'on_track' | 'met' | 'missed' | 'exceeded';
  readonly isClosed: boolean;
};

type CheckInBase = {
  readonly schemaVersion: 1;
  readonly id: CheckInId;
  readonly challengeId: ChallengeId;
  readonly ownerId: UserId;
  readonly periodId: ChallengePeriodId;
  readonly source: 'ios' | 'android' | 'web' | 'server' | 'support';
  readonly clientRecordedAt: IsoDateTime;
  readonly serverRecordedAt: IsoDateTime | null;
  readonly idempotencyKey?: string;
  readonly correctsEventId?: CheckInId;
};

export type BuildCompletionEvent = CheckInBase & { readonly type: 'build_completion'; readonly behaviorCompleted: true };
export type CutBackTotalEvent = CheckInBase & {
  readonly type: 'cut_back_total';
  readonly currentTotal: number;
  readonly unit: string;
  /** Evaluation selects the latest trusted event for a period; earlier totals remain in history. */
  readonly supersedesEventId?: CheckInId;
};
export type StopStatusEvent = CheckInBase & { readonly type: 'stop_status'; readonly status: 'intact' | 'lapse' };
export type CheckInEvent = BuildCompletionEvent | CutBackTotalEvent | StopStatusEvent;

/** Periods are generated server-side later, using the snapshot timezone and explicit DST policy. */
export type GeneratePeriods = (input: {
  readonly challengeId: ChallengeId;
  readonly startsAt: IsoDateTime;
  readonly plannedEndsAt: IsoDateTime;
  readonly timezone: string;
  readonly unit: PeriodUnit;
}) => readonly ChallengePeriod[];
