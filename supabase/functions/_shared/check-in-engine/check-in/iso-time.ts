// Verbatim copy of domain/challenge/check-in/iso-time.ts for the Deno edge-function runtime boundary
// (Deno requires explicit .ts extensions on relative imports; Metro/tsc
// resolve extensionless ones, so the source of truth can't be imported
// directly). Only change from the source: added '.ts' to relative
// imports below. Keep byte-identical otherwise -- do not hand-edit logic
// here; change domain/challenge/check-in instead and re-copy.
import { IsoDateTime } from '../types.ts';

/** `IsoDateTime` is a branded string; comparisons go through `Date` rather than lexicographic string compare so differing (but equivalent) offset formats still order correctly. */
export function compareIso(a: IsoDateTime, b: IsoDateTime): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
