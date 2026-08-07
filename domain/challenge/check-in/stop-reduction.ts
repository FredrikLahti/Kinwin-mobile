import { ChallengePeriod } from '../periods';
import { CheckInId, IsoDateTime } from '../types';
import { compareIso } from './iso-time';
import { dedupeByOperationId, findOperationIdConflict } from './reduction';
import { CheckInEvent, CheckInFact } from './types';

/**
 * Stop's reduction is deliberately NOT "latest fact wins" — see
 * docs/CHECK_IN_ENGINE.md's "Stop is not a declared-value reduction"
 * section. A `stop_lapse` is a fact about a moment that already happened;
 * it does not become false just because the user later pings `stop_intact`
 * again. Each original event (`stop_intact` or `stop_lapse`) is its own,
 * independent entry in history — never implicitly superseded by a later
 * original — and can only be corrected by an explicit `correction` event
 * whose `correctionOfEventId` names it (or a correction of it) directly.
 *
 * A correction answers "what was the truth of the event I am correcting?" —
 * it is not automatically a new current-status attestation. Concretely: an
 * accidental `stop_lapse` corrected to `stop_intact` after tracking ends
 * removes that lapse from the effective lapse history, but the correction's
 * own (necessarily later) timestamp must never be mistaken for a *final
 * intact attestation* — that requires an ordinary, root `stop_intact`
 * declaration whose own trusted timestamp falls in the final window, not a
 * correction's timestamp. `ChainEntry` therefore keeps the root
 * declaration's own type and timestamp separate from the chain's terminal
 * (currently-effective, correction-resolved) fact and timestamp.
 */

type ChainEntry = {
  readonly rootEventId: CheckInId;
  /** The root declaration's own event type — a correction can change the *effective* fact, but never this. */
  readonly rootEventType: CheckInFact['kind'];
  /** The root declaration's own trusted timestamp — never altered by a later correction, however late that correction is recorded. */
  readonly rootRecordedAt: IsoDateTime;
  readonly terminalEventId: CheckInId;
  readonly terminalRecordedAt: IsoDateTime;
  /** The currently-effective fact for this chain, after applying any corrections. */
  readonly fact: CheckInFact;
};

export type StopHistoryResult =
  | {
      readonly ok: true;
      /** True if any original `stop_lapse` entry remains uncorrected — absorbing, regardless of what happens afterward. */
      readonly hasUncorrectedLapse: boolean;
      /** True if an ordinary, root `stop_intact` declaration exists — still currently effective, not itself a correction — whose OWN trusted timestamp lies in [period.endsAt, period.reportingClosesAt). A correction's timestamp never counts here, even one that resolves an earlier lapse to intact. */
      readonly hasFinalIntactAttestation: boolean;
      /** Informational only (e.g. for an `open` period's display) — the most recently recorded effective fact, not itself decisive. */
      readonly mostRecentFact: CheckInFact | null;
      /** Event ids a new correction may validly target: every chain's current, not-yet-superseded terminal. */
      readonly validCorrectionTargets: ReadonlySet<CheckInId>;
    }
  | { readonly ok: false; readonly reason: string };

export function resolveStopHistory(period: ChallengePeriod, eventsForPeriod: readonly CheckInEvent[]): StopHistoryResult {
  const trusted = eventsForPeriod.filter((event) => event.serverRecordedAt !== null);
  if (trusted.some((event) => event.periodId !== period.id)) {
    return { ok: false, reason: 'event does not belong to the period being reduced' };
  }

  const conflict = findOperationIdConflict(trusted);
  if (conflict) return { ok: false, reason: conflict };
  const deduplicated = dedupeByOperationId(trusted);

  const byId = new Map(deduplicated.map((event) => [event.id, event] as const));
  const correctionsTargeting = new Map<CheckInId, CheckInEvent>();
  for (const event of deduplicated) {
    if (event.eventType !== 'correction') continue;
    if (!byId.has(event.correctionOfEventId)) {
      return { ok: false, reason: 'a correction targets an entry outside this period\'s history' };
    }
    if (correctionsTargeting.has(event.correctionOfEventId)) {
      return { ok: false, reason: 'two corrections target the same entry' };
    }
    correctionsTargeting.set(event.correctionOfEventId, event);
  }

  const originals = deduplicated.filter((event) => event.eventType !== 'correction');
  const reached = new Set<CheckInId>();
  const chainEntries: ChainEntry[] = [];
  for (const original of originals) {
    reached.add(original.id);
    let terminal: CheckInEvent = original;
    const visited = new Set<CheckInId>([original.id]);
    while (correctionsTargeting.has(terminal.id)) {
      terminal = correctionsTargeting.get(terminal.id)!;
      if (visited.has(terminal.id)) return { ok: false, reason: 'a stop correction chain forms a cycle' };
      visited.add(terminal.id);
      reached.add(terminal.id);
    }
    chainEntries.push({
      rootEventId: original.id,
      rootEventType: original.fact.kind,
      rootRecordedAt: original.serverRecordedAt!,
      terminalEventId: terminal.id,
      terminalRecordedAt: terminal.serverRecordedAt!,
      fact: terminal.fact,
    });
  }

  if (reached.size !== deduplicated.length) {
    return { ok: false, reason: 'a correction was recorded with no prior entry for this period' };
  }

  const hasUncorrectedLapse = chainEntries.some((entry) => entry.fact.kind === 'stop_lapse');
  // The final attestation must be an ordinary root `stop_intact` declaration
  // (never a correction masquerading as one — see the module doc comment
  // above), timestamped in the final window using ITS OWN recorded time,
  // and its chain must still currently resolve to `stop_intact` (an
  // ordinary final intact later corrected to a lapse no longer qualifies —
  // that lapse also makes `hasUncorrectedLapse` true above, which already
  // takes priority).
  const hasFinalIntactAttestation = chainEntries.some(
    (entry) =>
      entry.rootEventType === 'stop_intact' &&
      entry.fact.kind === 'stop_intact' &&
      compareIso(entry.rootRecordedAt, period.endsAt) >= 0 &&
      compareIso(entry.rootRecordedAt, period.reportingClosesAt) < 0,
  );
  const mostRecentFact = chainEntries.length === 0
    ? null
    : chainEntries.reduce((latest, entry) => (compareIso(entry.terminalRecordedAt, latest.terminalRecordedAt) > 0 ? entry : latest)).fact;
  const validCorrectionTargets = new Set(chainEntries.map((entry) => entry.terminalEventId));

  return { ok: true, hasUncorrectedLapse, hasFinalIntactAttestation, mostRecentFact, validCorrectionTargets };
}
