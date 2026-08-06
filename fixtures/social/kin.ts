import { KinId, KinProfile, KinshipStatus } from '@/domain/social/types';
import { KinDirectoryEntry } from '@/lib/social/add-kin';

// All fixture data in this file is illustrative only — see
// docs/SOCIAL_UX_V1.md for what is fixture-only vs. future backend work.

export const ME: KinProfile = {
  id: 'kin-me' as KinId,
  username: 'you',
  displayName: 'You',
  initials: 'Y',
  relationshipNote: 'This device',
};

export const KIN_PROFILES = {
  alex: {
    id: 'kin-alex' as KinId,
    username: 'alex_r',
    displayName: 'Alex',
    initials: 'AR',
    relationshipNote: 'Best friend',
  },
  priya: {
    id: 'kin-priya' as KinId,
    username: 'priya.k',
    displayName: 'Priya',
    initials: 'PK',
    relationshipNote: 'Sister',
  },
  mia: {
    id: 'kin-mia' as KinId,
    username: 'mia.rowan',
    displayName: 'Mia',
    initials: 'MR',
    relationshipNote: 'Roommate',
  },
  jonas: {
    id: 'kin-jonas' as KinId,
    username: 'jonas_b',
    displayName: 'Jonas',
    initials: 'JB',
    relationshipNote: 'Little brother',
  },
  theo: {
    id: 'kin-theo' as KinId,
    username: 'theo_b',
    displayName: 'Theo',
    initials: 'TB',
    relationshipNote: 'Gym Kin',
  },
  sam: {
    id: 'kin-sam' as KinId,
    username: 'sam_k',
    displayName: 'Sam',
    initials: 'SK',
    relationshipNote: 'College friend',
  },
} as const satisfies Record<string, KinProfile>;

/** Approved Kin — the mutual friend graph shown on My Kin. */
export const APPROVED_KIN: readonly KinProfile[] = [
  KIN_PROFILES.alex,
  KIN_PROFILES.priya,
  KIN_PROFILES.mia,
  KIN_PROFILES.jonas,
];

/** Requests someone sent to Me, awaiting my accept/decline. */
export const PENDING_INCOMING: readonly KinProfile[] = [KIN_PROFILES.theo];

/** Requests I sent, awaiting their accept/decline. */
export const PENDING_OUTGOING: readonly KinProfile[] = [
  {
    id: 'kin-nora' as KinId,
    username: 'nora_p',
    displayName: 'Nora',
    initials: 'NP',
    relationshipNote: 'Neighbor',
  },
];

const kinshipStatusFor = (id: KinId): KinshipStatus | null => {
  if (APPROVED_KIN.some((kin) => kin.id === id)) return 'approved';
  if (PENDING_INCOMING.some((kin) => kin.id === id)) return 'pending_incoming';
  if (PENDING_OUTGOING.some((kin) => kin.id === id)) return 'pending_outgoing';
  return null;
};

/**
 * Every person Add Kin can deterministically resolve by exact username,
 * including Sam — who is a real, findable person with no relationship to
 * Me yet — so "exact_match" has a fixture to demonstrate.
 */
export const ADD_KIN_DIRECTORY: readonly KinDirectoryEntry[] = [
  ...APPROVED_KIN,
  ...PENDING_INCOMING,
  ...PENDING_OUTGOING,
  KIN_PROFILES.sam,
].map((profile) => ({ profile, status: kinshipStatusFor(profile.id) }));
