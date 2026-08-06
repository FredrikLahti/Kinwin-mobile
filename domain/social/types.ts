import { Brand } from '../challenge/types';

// Types for the Social v1 UX prototype (see docs/SOCIAL_V1_SPEC.md and
// docs/SOCIAL_UX_V1.md). Nothing here is persisted; it exists to keep the
// prototype's private/social boundary typed and honest ahead of a real
// backend, per docs/SOCIAL_V1_SPEC.md section 4.

export type KinId = Brand<string, 'KinId'>;
export type SocialChallengeId = Brand<string, 'SocialChallengeId'>;
export type SocialEventId = Brand<string, 'SocialEventId'>;
export type SocialCommentId = Brand<string, 'SocialCommentId'>;

export type KinshipStatus = 'approved' | 'pending_incoming' | 'pending_outgoing';

export type KinProfile = {
  readonly id: KinId;
  readonly username: string;
  readonly displayName: string;
  readonly initials: string;
  /** Flavor text only (e.g. "Sister", "Gym Kin") — never used for access control. */
  readonly relationshipNote: string;
};

export type ReactionKind = 'fire' | 'laugh' | 'strength' | 'wince' | 'crown' | 'salute';

export type ReactionCounts = Readonly<Partial<Record<ReactionKind, number>>>;

/**
 * The three audience/detail choices from docs/SOCIAL_V1_SPEC.md section 4.
 * Kept as two independent axes because they compose: e.g. "Selected Kin"
 * plus "Progress only" is a valid combination.
 */
export type ChallengeAudience = 'only_me' | 'all_kin' | 'selected_kin';
export type ChallengeDetailLevel = 'exact' | 'general' | 'progress_only';

export type ChallengeLifecycleEventKind =
  | 'challenge_started'
  | 'milestone_reached'
  | 'missed_commitment'
  | 'consequence_activated'
  | 'consequence_completed';

/**
 * A single lifecycle moment, already written the way it may be shown to an
 * exact-detail Kin. General/progress-only viewers get a separately-authored,
 * less specific line (see `projectLifecycleEvent` in lib/social/projection.ts)
 * rather than a redacted version of this one, so masking is never visible as
 * missing words or placeholders.
 */
export type ChallengeLifecycleEvent = {
  readonly id: string;
  readonly kind: ChallengeLifecycleEventKind;
  readonly dayLabel: string;
  readonly exactHeadline: string;
  readonly generalHeadline: string;
};

/**
 * The PRIVATE record of a challenge, as only its owner could see it in a
 * real backend. Only `lib/social/projection.ts` and the owner-facing
 * audience/detail preview screen may import this module — every other
 * screen must consume `fixtures/social/challenge-projections.ts` instead.
 */
export type PrivateChallengeFixture = {
  readonly id: SocialChallengeId;
  readonly ownerId: KinId;
  readonly ownerDisplayName: string;
  readonly exactTitle: string;
  readonly exactDescription: string;
  readonly generalTitle: string;
  readonly generalDescription: string;
  readonly startedLabel: string;
  readonly plannedEndLabel: string;
  /** Behavior-specific progress — only ever shown at exact/general detail. */
  readonly behaviorProgress: { readonly current: number; readonly target: number; readonly unit: string };
  /** Generic day-based progress — safe to show even at progress-only detail. */
  readonly dayProgress: { readonly daysElapsed: number; readonly totalDays: number };
  readonly consequenceSummary: string;
  readonly recipientNames: readonly string[];
  readonly audience: ChallengeAudience;
  readonly detailLevel: ChallengeDetailLevel;
  /** Only meaningful when `audience === 'selected_kin'`. */
  readonly selectedKinIds: readonly KinId[];
  readonly lifecycle: readonly ChallengeLifecycleEvent[];
};

/**
 * What an authorized Kin viewer actually receives — the future RLS/API
 * response shape. `recipientNames` and `consequenceSummary` are `null`
 * whenever the detail level does not authorize showing them, and `title`/
 * `description`/`progressLabel` are already the correct wording for the
 * viewer's detail level (never the exact fields with something stripped out).
 */
export type SocialChallengeProjection = {
  readonly challengeId: SocialChallengeId;
  readonly ownerId: KinId;
  readonly ownerDisplayName: string;
  readonly detailLevel: ChallengeDetailLevel;
  readonly title: string;
  readonly description: string;
  readonly startedLabel: string;
  readonly plannedEndLabel: string;
  readonly progressLabel: string;
  readonly progressRatio: number;
  readonly recipientNames: readonly string[] | null;
  readonly consequenceSummary: string | null;
  readonly lifecycle: readonly { readonly id: string; readonly dayLabel: string; readonly headline: string }[];
};

export type SocialEventKind =
  | 'challenge_started'
  | 'milestone_reached'
  | 'missed_commitment'
  | 'consequence_activated'
  | 'consequence_completed';

/**
 * A single Kin-feed card. Built only from a `SocialChallengeProjection`
 * (never a `PrivateChallengeFixture`) plus feed-specific display fields.
 */
export type SocialEvent = {
  readonly id: SocialEventId;
  readonly kind: SocialEventKind;
  readonly challengeId: SocialChallengeId;
  readonly actorDisplayName: string;
  readonly actorInitials: string;
  readonly timeLabel: string;
  readonly headline: string;
  readonly detail: string;
  readonly reactions: ReactionCounts;
};

export type SocialComment = {
  readonly id: SocialCommentId;
  readonly authorDisplayName: string;
  readonly authorInitials: string;
  readonly timeLabel: string;
  readonly body: string;
  readonly reactions: ReactionCounts;
  readonly replies: readonly Omit<SocialComment, 'replies'>[];
};

export type AddKinOutcome =
  | { readonly kind: 'exact_match'; readonly profile: KinProfile }
  | { readonly kind: 'already_kin'; readonly profile: KinProfile }
  | { readonly kind: 'request_pending'; readonly profile: KinProfile }
  | { readonly kind: 'no_match'; readonly queriedUsername: string };
