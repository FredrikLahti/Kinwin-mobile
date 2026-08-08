// Verbatim copy of domain/challenge/check-in/types.ts for the Deno edge-function runtime boundary
// (Deno requires explicit .ts extensions on relative imports; Metro/tsc
// resolve extensionless ones, so the source of truth can't be imported
// directly). Only change from the source: added '.ts' to relative
// imports below. Keep byte-identical otherwise -- do not hand-edit logic
// here; change domain/challenge/check-in instead and re-copy.
import { Brand, ChallengeId, ChallengePeriodId, CheckInId, IsoDateTime, UserId } from '../types.ts';

// The append-only check-in event model. See docs/CHECK_IN_ENGINE.md for the
// full write-up. This reconciles the mismatch flagged in
// docs/BACKEND_IMPLEMENTATION_PLAN.md phase 5 between the original TS stub
// (a generic `correctsEventId` on every event, plus a separate
// `supersedesEventId` only on cut-back events) and the actual SQL schema
// (`supabase/migrations/20260803000000_initial_kinwin_schema.sql`'s
// `check_in_events` table), which has exactly one correction mechanism: a
// dedicated `'correction'` `event_type` plus `correction_of_event_id`. This
// module is the SQL-aligned shape; the SQL schema is authoritative.

/**
 * Maps to `check_in_events.idempotency_key`. Named for what it is at the
 * domain layer — an identifier the *client* mints once per logical
 * operation and resubmits verbatim on retry — rather than the storage-layer
 * name, since nothing here assumes it will always back a SQL unique index.
 */
export type ClientOperationId = Brand<string, 'ClientOperationId'>;

export type CheckInSource = 'ios' | 'android' | 'web' | 'server' | 'support';

/**
 * The declarative fact a check-in event carries. `build_completion` and
 * `cut_back_total` both declare a *current value for the period*, not a
 * delta — deliberately symmetric with each other and with the two `stop_*`
 * facts, so every direction reduces the same way: the latest valid event
 * for a period is that period's effective fact (see reduction.ts). This is
 * a documented modeling choice, not a literal mirror of "one tap = one
 * event"; see docs/CHECK_IN_ENGINE.md's "Why declared values, not deltas"
 * for the reasoning and its consequence for how a correction works.
 */
export type CheckInFact =
  | { readonly kind: 'build_completion'; readonly completions: number }
  | { readonly kind: 'cut_back_total'; readonly total: number; readonly unit: string }
  | { readonly kind: 'stop_intact' }
  | { readonly kind: 'stop_lapse' };

export type CheckInEventType = CheckInFact['kind'] | 'correction';

type CheckInEventBase = {
  readonly schemaVersion: 1;
  readonly id: CheckInId;
  readonly challengeId: ChallengeId;
  readonly ownerId: UserId;
  readonly periodId: ChallengePeriodId;
  readonly source: CheckInSource;
  readonly clientRecordedAt: IsoDateTime;
  /** `null` until the trusted server stamps it — see docs/CHECK_IN_ENGINE.md's trust boundary. */
  readonly serverRecordedAt: IsoDateTime | null;
  /** `null` only for pre-idempotency-model historical/imported data; every real client write carries one. */
  readonly operationId: ClientOperationId | null;
};

/** A first-time declaration for a period — not itself a correction of anything. */
export type OriginalCheckInEvent = CheckInEventBase & {
  readonly eventType: CheckInFact['kind'];
  readonly fact: CheckInFact;
};

/**
 * Explicitly replaces one earlier event for the same period. Never mutates
 * or removes `correctionOfEventId`'s row — this is itself a new,
 * independent row; the prior one remains in history untouched (see
 * reduction.ts for how the *effective* fact is derived from the chain).
 */
export type CorrectionCheckInEvent = CheckInEventBase & {
  readonly eventType: 'correction';
  readonly correctionOfEventId: CheckInId;
  readonly fact: CheckInFact;
};

export type CheckInEvent = OriginalCheckInEvent | CorrectionCheckInEvent;

export function factsEqual(a: CheckInFact, b: CheckInFact): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'build_completion' && b.kind === 'build_completion') return a.completions === b.completions;
  if (a.kind === 'cut_back_total' && b.kind === 'cut_back_total') return a.total === b.total && a.unit === b.unit;
  return true;
}
