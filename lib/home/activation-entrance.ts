/**
 * Whether Home's first-active entrance should play, given the raw
 * '?justActivated' query value (already normalized to a single string, or
 * undefined, by the caller — expo-router can hand back a string[] for a
 * repeated param). Only the literal '1' set by
 * app/account/pending-commitment.tsx's activate(), right after the server
 * confirms activation, counts — anything else (undefined, an empty string,
 * a stray duplicate) is an ordinary Home visit.
 */
export function shouldShowActivationEntrance(justActivatedParam: string | undefined): boolean {
  return justActivatedParam === '1';
}
