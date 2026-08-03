import { ChallengeStatus, IsoDateTime, UserId } from '../challenge/types';

export type MembershipStatus = 'trialing' | 'active' | 'grace_period' | 'expired' | 'canceled_pending_expiry';
export type AccessMode = 'full' | 'completion' | 'none';
export type AccessCapability = 'required_check_ins' | 'challenge_status' | 'final_result' | 'consequence_completion' | 'start_challenge' | 'premium_guidance' | 'analytics' | 'recommendations' | 'member_features';

export type MembershipAccess = {
  readonly schemaVersion: 1;
  readonly userId: UserId;
  readonly status: MembershipStatus;
  readonly mode: AccessMode;
  readonly accessEndsAt: IsoDateTime | null;
};

export const COMPLETION_MODE_CAPABILITIES: readonly AccessCapability[] = ['required_check_ins', 'challenge_status', 'final_result', 'consequence_completion'];

export function accessModeFor(status: MembershipStatus, challengeStatus: ChallengeStatus): AccessMode {
  const challengeIsOngoing = challengeStatus === 'active' || challengeStatus === 'completion_mode';
  if (status === 'expired') return challengeIsOngoing ? 'completion' : 'none';
  return 'full';
}
