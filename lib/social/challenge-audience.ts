import { OnboardingChallengeAudience } from '@/domain/social/onboarding';
import { KinId } from '@/domain/social/types';

/**
 * Pure audience transitions for the Journey 7 challenge-audience demo. See
 * `domain/social/onboarding.ts` for why `all_kin_snapshot` freezes the
 * approved-Kin id list at selection time instead of re-deriving it live —
 * that snapshot is what makes "newly accepted Kin receive no retroactive
 * access" true by construction rather than by a rule someone could forget.
 */

export function chooseOnlyMe(): OnboardingChallengeAudience {
  return { kind: 'only_me', audienceKinIds: [] };
}

export function chooseAllKin(currentlyApprovedKinIds: readonly KinId[]): OnboardingChallengeAudience {
  return { kind: 'all_kin_snapshot', audienceKinIds: [...currentlyApprovedKinIds] };
}

export function chooseSelectedKin(selectedKinIds: readonly KinId[]): OnboardingChallengeAudience {
  return { kind: 'selected_kin', audienceKinIds: [...selectedKinIds] };
}

/**
 * "Selected Kin" with zero people picked is not yet socially visible to
 * anyone — the challenge stays effectively private until at least one
 * person is chosen (Journey 7's explicit requirement).
 */
export function hasSocialVisibility(audience: OnboardingChallengeAudience): boolean {
  return audience.kind !== 'only_me' && audience.audienceKinIds.length > 0;
}

export function kinHasAccess(audience: OnboardingChallengeAudience, kinId: KinId): boolean {
  return audience.kind !== 'only_me' && audience.audienceKinIds.includes(kinId);
}
