import { IncomingKinshipRequest, KinshipRequestId, OutgoingKinshipRequest } from '@/domain/social/onboarding';
import { KinId, KinProfile } from '@/domain/social/types';

/**
 * Pure Kinship-request transitions for the social onboarding prototype (see
 * docs/SOCIAL_ONBOARDING_UX.md). Kept independent of any React state so the
 * send/withdraw/accept/decline rules are unit-testable on their own — the
 * context and screens only ever call these functions, never mutate arrays
 * inline.
 */

export function sendOutgoingRequest(
  current: readonly OutgoingKinshipRequest[],
  profile: KinProfile,
): readonly OutgoingKinshipRequest[] {
  if (current.some((request) => request.profile.id === profile.id)) return current;
  return [...current, { id: `outgoing-${profile.id}` as KinshipRequestId, profile }];
}

export function withdrawOutgoingRequest(
  current: readonly OutgoingKinshipRequest[],
  requestId: KinshipRequestId,
): readonly OutgoingKinshipRequest[] {
  return current.filter((request) => request.id !== requestId);
}

export type IncomingAcceptResult = {
  readonly incoming: readonly IncomingKinshipRequest[];
  readonly approved: readonly KinProfile[];
};

/**
 * Accepting an incoming request moves the requester into `approved` and
 * removes the request — nothing else. It deliberately does not touch any
 * challenge/audience state, which is what encodes "accepting a Kinship does
 * not itself grant access to any challenge" at the type level: this
 * function has no way to grant challenge access even if it wanted to.
 */
export function acceptIncomingRequest(
  incoming: readonly IncomingKinshipRequest[],
  approved: readonly KinProfile[],
  requestId: KinshipRequestId,
): IncomingAcceptResult {
  const request = incoming.find((candidate) => candidate.id === requestId);
  if (!request) return { incoming, approved };
  return {
    incoming: incoming.filter((candidate) => candidate.id !== requestId),
    approved: [...approved, request.profile],
  };
}

export function declineIncomingRequest(
  incoming: readonly IncomingKinshipRequest[],
  requestId: KinshipRequestId,
): readonly IncomingKinshipRequest[] {
  return incoming.filter((request) => request.id !== requestId);
}

/**
 * A fixture stand-in for "the other person accepted from their own
 * session" (Journey 3) — moves an outgoing request straight to approved,
 * the same end state `acceptIncomingRequest` produces for an incoming one.
 */
export function simulateOutgoingAccepted(
  outgoing: readonly OutgoingKinshipRequest[],
  approved: readonly KinProfile[],
  requestId: KinshipRequestId,
): { readonly outgoing: readonly OutgoingKinshipRequest[]; readonly approved: readonly KinProfile[] } {
  const request = outgoing.find((candidate) => candidate.id === requestId);
  if (!request) return { outgoing, approved };
  return {
    outgoing: outgoing.filter((candidate) => candidate.id !== requestId),
    approved: [...approved, request.profile],
  };
}

/**
 * Removes future eligibility only — it does not touch, redact, or annotate
 * any past challenge/comment data, because this prototype does not invent a
 * historical-erasure policy (see Journey 6 / docs/SOCIAL_ONBOARDING_UX.md).
 */
export function removeApprovedKin(
  approved: readonly KinProfile[],
  kinId: KinId,
): readonly KinProfile[] {
  return approved.filter((kin) => kin.id !== kinId);
}
