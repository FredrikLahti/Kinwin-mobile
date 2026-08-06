import { Brand } from '../challenge/types';
import { KinId, KinProfile } from './types';

// Types for the Social Onboarding UX prototype (see
// docs/SOCIAL_ONBOARDING_UX.md and docs/SOCIAL_UX_V1.md). Nothing here is
// persisted — session-only fixture state for evaluating the cold-start
// social experience ahead of any real backend.

export type KinshipRequestId = Brand<string, 'KinshipRequestId'>;

/** A request someone else sent to Me, awaiting my accept/decline. */
export type IncomingKinshipRequest = {
  readonly id: KinshipRequestId;
  readonly profile: KinProfile;
};

/** A request I sent, awaiting their accept/decline. */
export type OutgoingKinshipRequest = {
  readonly id: KinshipRequestId;
  readonly profile: KinProfile;
};

export type UsernameCheckOutcome =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid_format'; readonly reason: string }
  | { readonly kind: 'available'; readonly username: string }
  | { readonly kind: 'unavailable'; readonly username: string };

export type SocialIdentityStatus = 'none' | 'saving' | 'saved';

export type SocialIdentity = {
  readonly status: SocialIdentityStatus;
  /** Set once `status` reaches 'saved'. Never a display name — see docs. */
  readonly username: string | null;
};

export type InvitationRecord = {
  readonly link: string;
  readonly message: string;
  readonly senderDisplayName: string;
  readonly createdAtLabel: string;
};

/**
 * The audience model for the Journey 7 challenge-audience transition demo.
 * Kept deliberately separate from `fixtures/social/private-challenges.ts`'s
 * `ChallengeAudience` + `selectedKinIds` shape (which PR #13 already owns)
 * so this package never touches that architecture.
 *
 * Split into two distinct states on purpose, per founder review: choosing
 * "All my Kin" (or picking people for "Selected Kin") is only an editable
 * INTENT — it previews who would be included but grants nobody access yet.
 * A separate, explicit "Lock audience for this challenge" action is what
 * actually creates the frozen `LockedChallengeAudience` snapshot. Only a
 * locked snapshot is ever checked for access — an unlocked intent behaves
 * exactly like "Only me" for every access purpose, because nothing has
 * actually been committed to share yet.
 *
 * Which real server event performs this lock — commitment creation vs.
 * final challenge activation — is not decided; see
 * docs/SOCIAL_ONBOARDING_UX.md's unresolved decisions.
 */
export type OnboardingChallengeAudienceKind = 'only_me' | 'all_kin' | 'selected_kin';

/** The editable, pre-lock choice. `selectedKinIds` is only meaningful for `kind: 'selected_kin'`. */
export type OnboardingChallengeAudienceIntent = {
  readonly kind: OnboardingChallengeAudienceKind;
  readonly selectedKinIds: readonly KinId[];
};

/**
 * The frozen snapshot created by the explicit lock action. For `all_kin`,
 * `audienceKinIds` is the approved-Kin id list at the moment of locking —
 * intentionally NOT re-derived from the live approved list afterward, which
 * is what encodes "people accepted later do not automatically gain
 * retroactive access to this challenge."
 */
export type LockedChallengeAudience = {
  readonly kind: OnboardingChallengeAudienceKind;
  readonly audienceKinIds: readonly KinId[];
};

/** A minimal fixture standing in for a solo draft/active challenge — see Journey 8. */
export type SoloChallengeFixture = {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly kind: 'draft' | 'active';
};
