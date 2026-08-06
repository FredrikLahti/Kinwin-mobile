import { InvitationRecord } from '@/domain/social/onboarding';
import { KinProfile } from '@/domain/social/types';

/**
 * Builds an illustrative invitation link and message (Journey 4). Nothing
 * here creates a real deep link, and nothing about token expiration, reuse,
 * or wrong-recipient handling is modeled — see
 * docs/SOCIAL_ONBOARDING_UX.md's unresolved decisions.
 */
export function createInvitation(senderDisplayName: string): InvitationRecord {
  const token = Math.random().toString(36).slice(2, 10);
  return {
    link: `https://kinwin.app/i/${token}`,
    message: `${senderDisplayName} invited you to Kinwin — a private way to keep a promise in front of people who matter. No pressure, just have a look: https://kinwin.app/i/${token}`,
    senderDisplayName,
    createdAtLabel: 'Just now',
  };
}

/**
 * Accepting an invitation creates the mutual Kinship directly — no separate
 * Add Kin/request step, because the sender already expressed intent by
 * issuing the invitation in the first place. This is the one place in the
 * prototype where a Kinship is created without a pending-request step; see
 * `lib/social/kinship-requests.ts` for the ordinary two-step Add Kin path.
 *
 * Like every other Kinship-creation path, this only ever touches the
 * approved-Kin list — it has no parameter or return path that could grant
 * challenge access (see `lib/social/invitation.test.ts`).
 */
export function acceptInvitation(
  approvedKin: readonly KinProfile[],
  inviterProfile: KinProfile,
): readonly KinProfile[] {
  if (approvedKin.some((kin) => kin.id === inviterProfile.id)) return approvedKin;
  return [...approvedKin, inviterProfile];
}
