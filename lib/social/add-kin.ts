import { AddKinOutcome, KinProfile, KinshipStatus } from '@/domain/social/types';

export type KinDirectoryEntry = {
  readonly profile: KinProfile;
  /** `null` means "not Kin yet, and no request between us" — an eligible exact match. */
  readonly status: KinshipStatus | null;
};

/**
 * Deterministic, local, exact-username lookup standing in for a future
 * server-side "find by exact username" call (docs/SOCIAL_V1_SPEC.md
 * section 3). Case-insensitive on the username only — this is a fixture
 * lookup, not a real search, and must never suggest near-matches.
 */
export function lookupUsername(
  rawUsername: string,
  directory: readonly KinDirectoryEntry[],
): AddKinOutcome {
  const username = rawUsername.trim();
  if (!username) return { kind: 'no_match', queriedUsername: username };

  const entry = directory.find(
    (candidate) => candidate.profile.username.toLowerCase() === username.toLowerCase(),
  );
  if (!entry) return { kind: 'no_match', queriedUsername: username };

  switch (entry.status) {
    case 'approved':
      return { kind: 'already_kin', profile: entry.profile };
    case 'pending_incoming':
    case 'pending_outgoing':
      return { kind: 'request_pending', profile: entry.profile };
    case null:
      return { kind: 'exact_match', profile: entry.profile };
  }
}
