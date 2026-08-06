import { UsernameCheckOutcome } from '@/domain/social/onboarding';

/**
 * Kinwin username format for this prototype (a product decision kept local
 * to the prototype until backend implementation — see
 * docs/SOCIAL_ONBOARDING_UX.md's "Unresolved decisions"): 3–20 characters,
 * lowercase letters, digits, dots, or underscores, starting with a letter.
 * People who already know the user find them through this exact string —
 * it is not a discovery handle, so no uniqueness-suggestion logic exists.
 */
const USERNAME_PATTERN = /^[a-z][a-z0-9_.]{2,19}$/;

/**
 * Deterministic, local username availability check standing in for a future
 * server-side uniqueness lookup. Case-insensitive against `takenUsernames`.
 */
export function checkUsername(
  rawUsername: string,
  takenUsernames: readonly string[],
): UsernameCheckOutcome {
  const trimmed = rawUsername.trim();
  if (!trimmed) return { kind: 'empty' };

  const username = trimmed.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return {
      kind: 'invalid_format',
      reason: 'Use 3–20 characters: lowercase letters, numbers, dots, or underscores, starting with a letter.',
    };
  }

  const taken = takenUsernames.some((existing) => existing.toLowerCase() === username);
  return taken ? { kind: 'unavailable', username } : { kind: 'available', username };
}
