import { ChallengeId, ChallengePeriodId, IsoDateTime, Measurement } from './types';

/**
 * Mirrors `challenge_periods.period_kind`
 * (`supabase/migrations/20260803000000_initial_kinwin_schema.sql`) exactly:
 * `'day' | 'week' | 'continuous'`. Deliberately a distinct type from
 * `PeriodUnit` in `./types` — that type describes the unit a *rule
 * boundary* is measured over (`day`/`week`/`challenge`, used by
 * `ChallengeRule`/`SuccessRuleSnapshot`), a different concept from what
 * kind of window a *generated period* actually is. The original stub
 * conflated the two by reusing `PeriodUnit` here; this is the reconciled,
 * SQL-aligned shape.
 */
export type ChallengePeriodKind = 'day' | 'week' | 'continuous';

export type PeriodTarget =
  | { readonly type: 'completion_target'; readonly target: number }
  | { readonly type: 'maximum_value'; readonly maximum: number; readonly measurement: Measurement }
  | { readonly type: 'maximum_lapses'; readonly maximum: number };

/**
 * A generated, immutable period descriptor — exactly what
 * `private.generate_challenge_periods` writes to `challenge_periods`.
 * Deliberately does NOT carry `computed_status`/`is_closed`: those are
 * cached, derived columns a future trusted write would populate by running
 * this package's evaluator (see `check-in/period-state.ts`), not trusted
 * input to it — an evaluator that read its own cached output as input could
 * never self-correct a stale cache.
 */
export type ChallengePeriod = {
  readonly schemaVersion: 1;
  readonly id: ChallengePeriodId;
  readonly challengeId: ChallengeId;
  readonly periodNumber: number;
  readonly periodKind: ChallengePeriodKind;
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly target: PeriodTarget;
};

/**
 * Periods are generated server-side by `private.generate_challenge_periods`
 * (`supabase/migrations/20260809000000_server_generated_periods.sql`), the
 * single authoritative implementation of the timezone/DST period-boundary
 * calculation. This type signature stays intentionally unimplemented here
 * so no competing TypeScript algorithm can ever drift from that one SQL
 * function — see that migration's own comment.
 */
export type GeneratePeriods = (input: {
  readonly challengeId: ChallengeId;
  readonly startsAt: IsoDateTime;
  readonly plannedEndsAt: IsoDateTime;
  readonly timezone: string;
  readonly periodKind: ChallengePeriodKind;
}) => readonly ChallengePeriod[];
