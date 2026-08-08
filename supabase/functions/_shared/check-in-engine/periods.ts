// Verbatim copy of domain/challenge/periods.ts for the Deno edge-function runtime boundary
// (Deno requires explicit .ts extensions on relative imports; Metro/tsc
// resolve extensionless ones, so the source of truth can't be imported
// directly). Only change from the source: added '.ts' to relative
// imports below. Keep byte-identical otherwise -- do not hand-edit logic
// here; change domain/challenge/check-in instead and re-copy.
import { ChallengeId, ChallengePeriodId, IsoDateTime, Measurement } from './types.ts';

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
 * `private.generate_challenge_periods` writes to `challenge_periods`, plus
 * `reportingClosesAt`. Deliberately does NOT carry `computed_status`/
 * `is_closed`: those are cached, derived columns a future trusted write
 * would populate by running this package's evaluator (see
 * `check-in/period-state.ts`), not trusted input to it — an evaluator that
 * read its own cached output as input could never self-correct a stale
 * cache.
 *
 * `endsAt` is the tracking boundary — when the behavior itself stops being
 * observed. `reportingClosesAt` is a separate, later, trusted boundary: the
 * self-service deadline by which a first report or a correction must be
 * submitted before the period is treated as finally decided. The two are
 * deliberately not the same field — see docs/CHECK_IN_ENGINE.md's
 * "Reporting window" section. This package does not choose a duration for
 * the gap between them (no hardcoded 12/24/48-hour rule here); the future
 * trusted activation/check-in write layer must supply an authoritative
 * `reportingClosesAt` for every period it persists.
 */
export type ChallengePeriod = {
  readonly schemaVersion: 1;
  readonly id: ChallengePeriodId;
  readonly challengeId: ChallengeId;
  readonly periodNumber: number;
  readonly periodKind: ChallengePeriodKind;
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly reportingClosesAt: IsoDateTime;
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
