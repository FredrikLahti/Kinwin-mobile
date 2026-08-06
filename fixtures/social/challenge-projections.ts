import { SocialChallengeId, SocialChallengeProjection } from '@/domain/social/types';
import { ME } from '@/fixtures/social/kin';
import { PRIVATE_CHALLENGES } from '@/fixtures/social/private-challenges';
import { projectSocialChallenge } from '@/lib/social/projection';

/**
 * Pre-authorized fixture data — what "Me" (an approved Kin of every owner
 * below) actually receives, already redacted for the challenge's audience
 * and detail level. Every Kin-facing screen (Kin feed, Challenge Room)
 * must import from here, never from fixtures/social/private-challenges.ts,
 * so the prototype never lets a component casually hold a full private
 * challenge object it isn't authorized to see.
 */
export const CHALLENGE_PROJECTIONS: readonly SocialChallengeProjection[] = PRIVATE_CHALLENGES
  .map((challenge) => projectSocialChallenge(challenge, { id: ME.id, isApprovedKin: true }))
  .filter((projection): projection is SocialChallengeProjection => projection !== null);

export function findChallengeProjection(id: SocialChallengeId): SocialChallengeProjection | undefined {
  return CHALLENGE_PROJECTIONS.find((projection) => projection.challengeId === id);
}
