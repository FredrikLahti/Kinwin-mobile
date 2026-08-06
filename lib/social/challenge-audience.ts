import {
  LockedChallengeAudience,
  OnboardingChallengeAudienceIntent,
} from '@/domain/social/onboarding';
import { KinId } from '@/domain/social/types';

/**
 * Pure audience transitions for the Journey 7 challenge-audience demo. See
 * `domain/social/onboarding.ts` for why the editable intent and the locked
 * snapshot are two separate types — only a locked snapshot is ever checked
 * for access, which is what makes "choosing All my Kin only previews;
 * locking is what commits" true by construction.
 */

export function chooseOnlyMeIntent(): OnboardingChallengeAudienceIntent {
  return { kind: 'only_me', selectedKinIds: [] };
}

export function chooseAllKinIntent(): OnboardingChallengeAudienceIntent {
  return { kind: 'all_kin', selectedKinIds: [] };
}

export function chooseSelectedKinIntent(selectedKinIds: readonly KinId[]): OnboardingChallengeAudienceIntent {
  return { kind: 'selected_kin', selectedKinIds: [...selectedKinIds] };
}

/**
 * The one function that creates a `LockedChallengeAudience`. For `all_kin`,
 * it freezes `currentlyApprovedKinIds` as they are at this exact call —
 * never re-evaluated later, so a Kin approved after this call is provably
 * excluded (see `lib/social/challenge-audience.test.ts`).
 */
export function lockAudience(
  intent: OnboardingChallengeAudienceIntent,
  currentlyApprovedKinIds: readonly KinId[],
): LockedChallengeAudience {
  if (intent.kind === 'only_me') return { kind: 'only_me', audienceKinIds: [] };
  if (intent.kind === 'all_kin') return { kind: 'all_kin', audienceKinIds: [...currentlyApprovedKinIds] };
  return { kind: 'selected_kin', audienceKinIds: [...intent.selectedKinIds] };
}

/**
 * An unlocked (`null`) audience behaves exactly like "Only me" for every
 * access purpose — an editable intent alone never makes a challenge
 * socially visible, no matter which option is currently selected.
 */
export function hasSocialVisibility(locked: LockedChallengeAudience | null): boolean {
  return locked !== null && locked.kind !== 'only_me' && locked.audienceKinIds.length > 0;
}

export function kinHasAccess(locked: LockedChallengeAudience | null, kinId: KinId): boolean {
  return locked !== null && locked.kind !== 'only_me' && locked.audienceKinIds.includes(kinId);
}
