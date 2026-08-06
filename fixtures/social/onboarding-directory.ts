import { KinId, KinProfile } from '@/domain/social/types';

// Fixture people for the Social Onboarding UX prototype
// (docs/SOCIAL_ONBOARDING_UX.md). Deliberately separate from
// fixtures/social/kin.ts, which seeds /social-preview with an already-
// populated My Kin — this package's cold-start persona starts with zero
// Kin, so its own cast can't reuse profiles the other prototype already
// treats as long-approved.

/** The prototype's "Me" identity before a Kinwin username has been chosen. */
export const ONBOARDING_ME_DISPLAY_NAME = 'You';

/** Discoverable by exact username via Add Kin — starts with no relationship to Me. */
export const SAM: KinProfile = {
  id: 'onboarding-kin-sam' as KinId,
  username: 'sam_k',
  displayName: 'Sam',
  initials: 'SK',
  relationshipNote: 'College friend',
};

/** Sends Me an incoming Kinship request during Journey 5. */
export const THEO: KinProfile = {
  id: 'onboarding-kin-theo' as KinId,
  username: 'theo_b',
  displayName: 'Theo',
  initials: 'TB',
  relationshipNote: 'Gym Kin',
};

/**
 * Joins My Kin AFTER a challenge audience has already been chosen (Journey
 * 7's "simulate a later Kin" demo) — exists specifically to demonstrate
 * that "All my Kin" is a snapshot, not a live set: Nora never gets
 * retroactive access to a challenge shared before she was Kin.
 */
export const NORA: KinProfile = {
  id: 'onboarding-kin-nora' as KinId,
  username: 'nora_p',
  displayName: 'Nora',
  initials: 'NP',
  relationshipNote: 'Neighbor',
};

/**
 * Usernames already taken by other Kinwin users, for the Journey 2 username
 * availability check (`lib/social/username.ts`). `sam_k` and `theo_b` are
 * intentionally excluded — they're this package's own fixture people, not
 * the prototype user's own candidate usernames.
 */
export const TAKEN_USERNAMES: readonly string[] = ['alex_r', 'mia.rowan', 'priya.k', 'jonas_b', 'nora_p'];
