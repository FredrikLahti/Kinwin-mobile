import { IsoDateTime } from '../types';

/** `IsoDateTime` is a branded string; comparisons go through `Date` rather than lexicographic string compare so differing (but equivalent) offset formats still order correctly. */
export function compareIso(a: IsoDateTime, b: IsoDateTime): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
