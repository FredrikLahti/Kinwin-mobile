import {
  ChallengeLifecycleEvent,
  KinId,
  PrivateChallengeFixture,
  SocialChallengeProjection,
} from '@/domain/social/types';

export type SocialViewer = {
  readonly id: KinId;
  readonly isApprovedKin: boolean;
};

/**
 * The single authorization + redaction boundary between a private challenge
 * record and what a given Kin viewer is allowed to receive. This is the
 * function a real backend's authorization layer would eventually implement
 * server-side (see docs/SOCIAL_V1_SPEC.md section 4) — the prototype runs it
 * client-side only so the owner-facing audience/detail preview screen can
 * demonstrate it live. No other screen may call this directly; they consume
 * the already-projected fixtures in fixtures/social/challenge-projections.ts.
 *
 * Returns `null` when the viewer has no access at all, so a screen can never
 * accidentally render a partially-redacted object for someone unauthorized.
 */
export function projectSocialChallenge(
  challenge: PrivateChallengeFixture,
  viewer: SocialViewer,
): SocialChallengeProjection | null {
  if (!viewer.isApprovedKin) return null;
  if (challenge.audience === 'only_me') return null;
  if (challenge.audience === 'selected_kin' && !challenge.selectedKinIds.includes(viewer.id)) return null;

  const progressRatio = challenge.dayProgress.totalDays > 0
    ? Math.min(1, challenge.dayProgress.daysElapsed / challenge.dayProgress.totalDays)
    : 0;

  if (challenge.detailLevel === 'progress_only') {
    return {
      challengeId: challenge.id,
      ownerId: challenge.ownerId,
      ownerDisplayName: challenge.ownerDisplayName,
      detailLevel: 'progress_only',
      title: `${challenge.ownerDisplayName}'s challenge`,
      description: 'Working toward something meaningful — check back for updates.',
      startedLabel: challenge.startedLabel,
      plannedEndLabel: challenge.plannedEndLabel,
      progressLabel: `Day ${challenge.dayProgress.daysElapsed} of ${challenge.dayProgress.totalDays}`,
      progressRatio,
      recipientNames: null,
      consequenceSummary: null,
      lifecycle: challenge.lifecycle.map((event) => projectLifecycleEvent(event, 'progress_only')),
    };
  }

  const exact = challenge.detailLevel === 'exact';
  return {
    challengeId: challenge.id,
    ownerId: challenge.ownerId,
    ownerDisplayName: challenge.ownerDisplayName,
    detailLevel: challenge.detailLevel,
    title: exact ? challenge.exactTitle : challenge.generalTitle,
    description: exact ? challenge.exactDescription : challenge.generalDescription,
    startedLabel: challenge.startedLabel,
    plannedEndLabel: challenge.plannedEndLabel,
    progressLabel: `${challenge.behaviorProgress.current} of ${challenge.behaviorProgress.target} ${challenge.behaviorProgress.unit}`,
    progressRatio: challenge.behaviorProgress.target > 0
      ? Math.min(1, challenge.behaviorProgress.current / challenge.behaviorProgress.target)
      : 0,
    recipientNames: challenge.recipientNames,
    consequenceSummary: challenge.consequenceSummary,
    lifecycle: challenge.lifecycle.map((event) => projectLifecycleEvent(event, challenge.detailLevel)),
  };
}

function projectLifecycleEvent(
  event: ChallengeLifecycleEvent,
  detailLevel: PrivateChallengeFixture['detailLevel'],
): { readonly id: string; readonly dayLabel: string; readonly headline: string } {
  return {
    id: event.id,
    dayLabel: event.dayLabel,
    headline: detailLevel === 'exact' ? event.exactHeadline : event.generalHeadline,
  };
}
