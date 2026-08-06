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
 * The audience choice for the Journey 7 challenge-audience transition demo.
 * Kept deliberately separate from `fixtures/social/private-challenges.ts`'s
 * `ChallengeAudience` + `selectedKinIds` shape (which PR #13 already owns)
 * so this package never touches that architecture — `audienceKinIds` is
 * this prototype's own explicit snapshot of who currently has access.
 *
 * `all_kin_snapshot` captures the approved-Kin id list at the moment "All my
 * Kin" is chosen. It is intentionally NOT re-derived from the live approved
 * list on every read — that is what encodes "people accepted later do not
 * automatically gain retroactive access to this challenge."
 */
export type OnboardingChallengeAudienceKind = 'only_me' | 'all_kin_snapshot' | 'selected_kin';

export type OnboardingChallengeAudience = {
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
