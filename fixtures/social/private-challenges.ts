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
    // Exact: names the private measurement and its failure threshold.
    // General: same recipients and consequence, but no measurement/threshold.
    exactConsequenceSummary: 'If Alex misses more than 2 days total, Mom and Jonas split a $150 spa afternoon.',
    generalConsequenceSummary: "If Alex doesn't complete the challenge, Mom and Jonas split a $150 spa afternoon.",
    recipientNames: ['Mom', 'Jonas (little brother)'],
    recipientFirstNames: ['Mom', 'Jonas'],
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
        progressOnlyHeadline: 'Alex started a challenge.',
      },
      {
        id: 'evt-milestone',
        kind: 'milestone_reached',
        dayLabel: 'Day 14',
        exactHeadline: 'Halfway there — zero missed days so far.',
        generalHeadline: 'Halfway through, and still going strong.',
        progressOnlyHeadline: 'Alex reached an important milestone.',
      },
      {
        id: 'evt-missed',
        kind: 'missed_commitment',
        dayLabel: 'Day 22',
        exactHeadline: 'Missed the commitment — birthday cake got the better of Alex.',
        generalHeadline: 'Had a slip after three strong weeks.',
        progressOnlyHeadline: 'Alex had a setback.',
      },
      {
        id: 'evt-consequence-activated',
        kind: 'consequence_activated',
        dayLabel: 'Day 22',
        exactHeadline: "Consequence activated — Mom and Jonas's spa afternoon is on.",
        generalHeadline: 'The consequence for this challenge is now active.',
        progressOnlyHeadline: 'The challenge consequence was activated.',
      },
      {
        id: 'evt-consequence-completed',
        kind: 'consequence_completed',
        dayLabel: 'Day 27',
        exactHeadline: 'Mom and Jonas had their spa afternoon — thanks, Alex.',
        generalHeadline: "Alex's loved ones received their consequence.",
        progressOnlyHeadline: 'The consequence was completed.',
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
    exactConsequenceSummary: 'If Priya misses the target, her running club chooses her next race entry fee.',
    generalConsequenceSummary: "If Priya doesn't complete the challenge, her running club decides what happens next.",
    recipientNames: ['Riverside Running Club'],
    recipientFirstNames: ['Riverside Running Club'],
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
        progressOnlyHeadline: 'Priya started a challenge.',
      },
    ],
  },
  {
    id: 'challenge-mia-journaling' as SocialChallengeId,
    ownerId: KIN_PROFILES.mia.id,
    ownerDisplayName: KIN_PROFILES.mia.displayName,
    exactTitle: 'Journal every night for 21 days',
    exactDescription: 'Writing in a journal every night before bed for 21 days straight.',
    generalTitle: 'A 21-day nightly habit',
    generalDescription: 'Building a consistent nightly routine for three weeks.',
    startedLabel: 'Day 1 · Jul 16',
    plannedEndLabel: 'Day 21 · Aug 5',
    behaviorProgress: { current: 21, target: 21, unit: 'nights journaled' },
    dayProgress: { daysElapsed: 21, totalDays: 21 },
    exactConsequenceSummary: "If Mia misses more than 1 night, Elin (her sister) picks the dinner spot for a month.",
    generalConsequenceSummary: "If Mia doesn't complete the challenge, Elin (her sister) picks the dinner spot for a month.",
    recipientNames: ['Elin (sister)'],
    recipientFirstNames: ['Elin'],
    audience: 'all_kin',
    detailLevel: 'exact',
    selectedKinIds: [],
    lifecycle: [
      {
        id: 'evt-mia-started',
        kind: 'challenge_started',
        dayLabel: 'Day 1',
        exactHeadline: 'Mia started: 21 nights of journaling in a row.',
        generalHeadline: 'Mia started a 21-day nightly habit.',
        progressOnlyHeadline: 'Mia started a challenge.',
      },
      {
        id: 'evt-mia-milestone',
        kind: 'milestone_reached',
        dayLabel: 'Day 14',
        exactHeadline: 'Two weeks in — not one missed night yet.',
        generalHeadline: 'Two weeks in, still going strong.',
        progressOnlyHeadline: 'Mia reached an important milestone.',
      },
      {
        id: 'evt-mia-succeeded',
        kind: 'challenge_succeeded',
        dayLabel: 'Day 21',
        exactHeadline: 'All 21 nights, no misses — the dinner-spot consequence is avoided.',
        generalHeadline: 'Challenge completed — the consequence is avoided.',
        progressOnlyHeadline: 'Mia finished the challenge.',
      },
    ],
  },
];

export function findPrivateChallenge(id: SocialChallengeId): PrivateChallengeFixture | undefined {
  return PRIVATE_CHALLENGES.find((challenge) => challenge.id === id);
}
