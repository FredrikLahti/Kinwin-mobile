import { InvitationRecord } from '@/domain/social/onboarding';

/**
 * Builds an illustrative invitation link and message (Journey 4). Nothing
 * here creates a real deep link, and nothing about accepting an invite is
 * modeled — invitations never touch Kinship or challenge-access state (see
 * `lib/social/invitation.test.ts`).
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
