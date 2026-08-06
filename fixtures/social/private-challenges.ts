import { PrivateChallengeFixture, SocialChallengeId } from '@/domain/social/types';
import { KIN_PROFILES } from '@/fixtures/social/kin';

/**
 * PRIVATE challenge records — the shape only a real owner-scoped table row
 * would expose. Import this only from lib/social/projection.ts and the
 * owner-facing audience/detail preview screen
 * (app/social-preview/audience-preview.tsx). Every Kin-facing screen must
 * import fixtures/social/challenge-projections.ts instead.
 */
export const PRIVATE_CHALLENGES: readonly PrivateChallengeFixture[] = [
  {
    id: 'challenge-alex-sugar' as SocialChallengeId,
    ownerId: KIN_PROFILES.alex.id,
    ownerDisplayName: KIN_PROFILES.alex.displayName,
    exactTitle: 'No added sugar for 30 days',
    exactDescription: 'Cutting all added sugar for 30 days straight — coffee, dessert, the works.',
    generalTitle: 'A month of cutting something out',
    generalDescription: "Working on cutting out a habit that's been hard to shake, one day at a time.",
    startedLabel: 'Day 1 · Jul 6',
    plannedEndLabel: 'Day 30 · Aug 4',
    behaviorProgress: { current: 22, target: 30, unit: 'days sugar-free' },
    dayProgress: { daysElapsed: 22, totalDays: 30 },
    consequenceSummary: 'If Alex misses more than 2 days total, Mom and Jonas split a $150 spa afternoon.',
    recipientNames: ['Mom', 'Jonas (little brother)'],
    audience: 'all_kin',
    detailLevel: 'exact',
    selectedKinIds: [],
    lifecycle: [
      {
        id: 'evt-started',
        kind: 'challenge_started',
        dayLabel: 'Day 1',
        exactHeadline: 'Alex started: 30 days with no added sugar.',
        generalHeadline: 'Alex started a 30-day challenge.',
      },
      {
        id: 'evt-milestone',
        kind: 'milestone_reached',
        dayLabel: 'Day 14',
        exactHeadline: 'Halfway there — zero missed days so far.',
        generalHeadline: 'Halfway through, and still going strong.',
      },
      {
        id: 'evt-missed',
        kind: 'missed_commitment',
        dayLabel: 'Day 22',
        exactHeadline: 'Missed the commitment — birthday cake got the better of Alex.',
        generalHeadline: 'Had a slip after three strong weeks.',
      },
      {
        id: 'evt-consequence-activated',
        kind: 'consequence_activated',
        dayLabel: 'Day 22',
        exactHeadline: "Consequence activated — Mom and Jonas's spa afternoon is on.",
        generalHeadline: 'The consequence for this challenge is now active.',
      },
      {
        id: 'evt-consequence-completed',
        kind: 'consequence_completed',
        dayLabel: 'Day 27',
        exactHeadline: 'Mom and Jonas had their spa afternoon — thanks, Alex.',
        generalHeadline: "Alex's loved ones received their consequence.",
      },
    ],
  },
  {
    id: 'challenge-priya-running' as SocialChallengeId,
    ownerId: KIN_PROFILES.priya.id,
    ownerDisplayName: KIN_PROFILES.priya.displayName,
    exactTitle: 'Run 3 times a week for 8 weeks',
    exactDescription: 'Three runs a week, minimum 20 minutes each, for 8 weeks before the half marathon.',
    generalTitle: 'An 8-week fitness challenge',
    generalDescription: 'Building a consistent training habit ahead of a race.',
    startedLabel: 'Day 1 · Aug 3',
    plannedEndLabel: 'Day 56 · Sep 28',
    behaviorProgress: { current: 2, target: 24, unit: 'runs completed' },
    dayProgress: { daysElapsed: 3, totalDays: 56 },
    consequenceSummary: "If Priya misses the target, her running club chooses her next race entry fee.",
    recipientNames: ['Riverside Running Club'],
    audience: 'all_kin',
    detailLevel: 'general',
    selectedKinIds: [],
    lifecycle: [
      {
        id: 'evt-priya-started',
        kind: 'challenge_started',
        dayLabel: 'Day 1',
        exactHeadline: 'Priya started: 3 runs a week for 8 weeks.',
        generalHeadline: 'Priya started an 8-week fitness challenge.',
      },
    ],
  },
];

export function findPrivateChallenge(id: SocialChallengeId): PrivateChallengeFixture | undefined {
  return PRIVATE_CHALLENGES.find((challenge) => challenge.id === id);
}
