import { SocialChallengeId, SocialFeedItem, SocialEventId } from '@/domain/social/types';
import { KIN_PROFILES } from '@/fixtures/social/kin';
import { findChallengeProjection } from '@/fixtures/social/challenge-projections';

const alex = findChallengeProjection('challenge-alex-sugar' as SocialChallengeId);
const priya = findChallengeProjection('challenge-priya-running' as SocialChallengeId);
const mia = findChallengeProjection('challenge-mia-journaling' as SocialChallengeId);

if (!alex || !priya || !mia) {
  throw new Error('Kin feed fixtures expect all showcase challenge projections to exist.');
}

/**
 * The Kin feed's chronological fixture items, newest first. Every entry is
 * built only from projected (already-authorized) challenge data — see
 * docs/SOCIAL_V1_SPEC.md section 12 for the full v1 event-type list this is
 * a realistic subset of. Routine check-ins are intentionally absent.
 *
 * Alex's missed commitment → consequence activated → consequence completed
 * are one closely-connected story from a single challenge, so they render
 * as one compact story card (`kind: 'story'`) instead of three near-
 * identical consecutive cards — a fixture/display-level grouping, not an
 * algorithmic feed. Success gets social weight too: Mia's completed
 * challenge is a first-class feed item, not just failure/consequence drama.
 */
export const SOCIAL_FEED_ITEMS: readonly SocialFeedItem[] = [
  {
    id: 'event-mia-succeeded' as SocialEventId,
    kind: 'challenge_succeeded',
    challengeId: mia.challengeId,
    actorDisplayName: KIN_PROFILES.mia.displayName,
    actorInitials: KIN_PROFILES.mia.initials,
    timeLabel: '1h ago',
    headline: mia.lifecycle[mia.lifecycle.length - 1].headline,
    detail: mia.title,
    reactions: { crown: 4, laugh: 7, salute: 2 },
  },
  {
    id: 'story-alex-consequence' as SocialEventId,
    kind: 'story',
    challengeId: alex.challengeId,
    actorDisplayName: KIN_PROFILES.alex.displayName,
    actorInitials: KIN_PROFILES.alex.initials,
    timeLabel: '2h ago',
    headline: "Alex's consequence played out",
    detail: alex.title,
    moments: [
      { label: 'Day 22', text: alex.lifecycle[2].headline },
      { label: 'Day 22', text: alex.lifecycle[3].headline },
      { label: 'Day 27', text: alex.lifecycle[4].headline },
    ],
    reactions: { fire: 4, laugh: 9, wince: 3, crown: 2 },
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
