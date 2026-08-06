import { SocialChallengeId, SocialEvent, SocialEventId } from '@/domain/social/types';
import { KIN_PROFILES } from '@/fixtures/social/kin';
import { findChallengeProjection } from '@/fixtures/social/challenge-projections';

const alex = findChallengeProjection('challenge-alex-sugar' as SocialChallengeId);
const priya = findChallengeProjection('challenge-priya-running' as SocialChallengeId);

if (!alex || !priya) {
  throw new Error('Kin feed fixtures expect both showcase challenge projections to exist.');
}

/**
 * The Kin feed's chronological fixture events, newest first. Every entry is
 * built only from projected (already-authorized) challenge data — see
 * docs/SOCIAL_V1_SPEC.md section 12 for the full v1 event-type list this is
 * a realistic subset of. Routine check-ins are intentionally absent.
 */
export const SOCIAL_EVENTS: readonly SocialEvent[] = [
  {
    id: 'event-consequence-completed' as SocialEventId,
    kind: 'consequence_completed',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '2h ago',
    headline: alex.lifecycle[alex.lifecycle.length - 1].headline,
    detail: alex.title,
    reactions: { fire: 4, laugh: 6, crown: 2 },
  },
  {
    id: 'event-consequence-activated' as SocialEventId,
    kind: 'consequence_activated',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '5d ago',
    headline: alex.lifecycle[3].headline,
    detail: alex.title,
    reactions: { laugh: 9, wince: 3 },
  },
  {
    id: 'event-missed' as SocialEventId,
    kind: 'missed_commitment',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '5d ago',
    headline: alex.lifecycle[2].headline,
    detail: alex.title,
    reactions: { wince: 5, laugh: 3 },
  },
  {
    id: 'event-priya-started' as SocialEventId,
    kind: 'challenge_started',
    challengeId: priya.challengeId,
    actorDisplayName: KIN_PROFILES.priya.displayName,
    actorInitials: KIN_PROFILES.priya.initials,
    timeLabel: '6d ago',
    headline: priya.lifecycle[0].headline,
    detail: priya.title,
    reactions: { strength: 3, fire: 1 },
  },
  {
    id: 'event-milestone' as SocialEventId,
    kind: 'milestone_reached',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '13d ago',
    headline: alex.lifecycle[1].headline,
    detail: alex.title,
    reactions: { strength: 7, fire: 3 },
  },
  {
    id: 'event-started' as SocialEventId,
    kind: 'challenge_started',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '27d ago',
    headline: alex.lifecycle[0].headline,
    detail: alex.title,
    reactions: { fire: 5, strength: 2 },
  },
];
