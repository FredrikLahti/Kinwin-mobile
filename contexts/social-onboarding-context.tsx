import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

import {
  IncomingKinshipRequest,
  InvitationRecord,
  KinshipRequestId,
  OnboardingChallengeAudience,
  OutgoingKinshipRequest,
  SocialIdentity,
} from '@/domain/social/onboarding';
import { KinId, KinProfile } from '@/domain/social/types';
import { createInvitation } from '@/lib/social/invitation';
import {
  acceptIncomingRequest,
  declineIncomingRequest,
  removeApprovedKin,
  sendOutgoingRequest,
  simulateOutgoingAccepted,
  withdrawOutgoingRequest,
} from '@/lib/social/kinship-requests';
import { chooseAllKin, chooseOnlyMe, chooseSelectedKin } from '@/lib/social/challenge-audience';

/**
 * The single typed prototype state model for the social onboarding UX
 * package (docs/SOCIAL_ONBOARDING_UX.md) — social identity, Kin, incoming/
 * outgoing requests, invitation state, and the challenge-audience choice.
 * Everything here is `useState` inside the provider: session-only, and it
 * resets honestly on reload because the provider itself remounts fresh.
 */
export type SocialOnboardingState = {
  readonly identity: SocialIdentity;
  readonly approvedKin: readonly KinProfile[];
  readonly incoming: readonly IncomingKinshipRequest[];
  readonly outgoing: readonly OutgoingKinshipRequest[];
  readonly invitation: InvitationRecord | null;
  readonly audience: OnboardingChallengeAudience;
  readonly continuedSolo: boolean;
};

const INITIAL_STATE: SocialOnboardingState = {
  identity: { status: 'none', username: null },
  approvedKin: [],
  incoming: [],
  outgoing: [],
  invitation: null,
  audience: chooseOnlyMe(),
  continuedSolo: false,
};

type SocialOnboardingContextValue = {
  readonly state: SocialOnboardingState;
  readonly beginSavingUsername: (username: string) => void;
  readonly sendKinRequest: (profile: KinProfile) => void;
  readonly withdrawKinRequest: (requestId: KinshipRequestId) => void;
  readonly simulateOtherSessionAccepted: (requestId: KinshipRequestId) => void;
  readonly receiveIncomingRequest: (profile: KinProfile) => void;
  readonly acceptIncoming: (requestId: KinshipRequestId) => void;
  readonly declineIncoming: (requestId: KinshipRequestId) => void;
  readonly removeKin: (kinId: KinId) => void;
  readonly sendInvitation: () => void;
  readonly chooseOnlyMeAudience: () => void;
  readonly chooseAllKinAudience: () => void;
  readonly chooseSelectedKinAudience: (kinIds: readonly KinId[]) => void;
  readonly markContinuedSolo: () => void;
  readonly resetToColdStart: () => void;
  /** Hub-only shortcuts for jumping straight to a screen's review state — never used by the real flow screens themselves. */
  readonly seedIdentityForReview: (username: string) => void;
  readonly seedApprovedKinForReview: (profiles: readonly KinProfile[]) => void;
};

const SocialOnboardingContext = createContext<SocialOnboardingContextValue | null>(null);

export function SocialOnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SocialOnboardingState>(INITIAL_STATE);
  const savingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginSavingUsername = useCallback((username: string) => {
    setState((current) => ({ ...current, identity: { status: 'saving', username: null } }));
    if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
    savingTimeoutRef.current = setTimeout(() => {
      setState((current) => ({ ...current, identity: { status: 'saved', username } }));
    }, 600);
  }, []);

  const sendKinRequest = useCallback((profile: KinProfile) => {
    setState((current) => ({ ...current, outgoing: sendOutgoingRequest(current.outgoing, profile) }));
  }, []);

  const withdrawKinRequest = useCallback((requestId: KinshipRequestId) => {
    setState((current) => ({ ...current, outgoing: withdrawOutgoingRequest(current.outgoing, requestId) }));
  }, []);

  const simulateOtherSessionAccepted = useCallback((requestId: KinshipRequestId) => {
    setState((current) => {
      const result = simulateOutgoingAccepted(current.outgoing, current.approvedKin, requestId);
      return { ...current, outgoing: result.outgoing, approvedKin: result.approved };
    });
  }, []);

  const receiveIncomingRequest = useCallback((profile: KinProfile) => {
    setState((current) => {
      if (current.incoming.some((request) => request.profile.id === profile.id)) return current;
      if (current.approvedKin.some((kin) => kin.id === profile.id)) return current;
      const request: IncomingKinshipRequest = { id: `incoming-${profile.id}` as KinshipRequestId, profile };
      return { ...current, incoming: [...current.incoming, request] };
    });
  }, []);

  const acceptIncoming = useCallback((requestId: KinshipRequestId) => {
    setState((current) => {
      const result = acceptIncomingRequest(current.incoming, current.approvedKin, requestId);
      return { ...current, incoming: result.incoming, approvedKin: result.approved };
    });
  }, []);

  const declineIncoming = useCallback((requestId: KinshipRequestId) => {
    setState((current) => ({ ...current, incoming: declineIncomingRequest(current.incoming, requestId) }));
  }, []);

  const removeKin = useCallback((kinId: KinId) => {
    setState((current) => ({ ...current, approvedKin: removeApprovedKin(current.approvedKin, kinId) }));
  }, []);

  const sendInvitation = useCallback(() => {
    setState((current) => ({
      ...current,
      invitation: createInvitation(current.identity.username ?? 'You'),
    }));
  }, []);

  const chooseOnlyMeAudience = useCallback(() => {
    setState((current) => ({ ...current, audience: chooseOnlyMe() }));
  }, []);

  const chooseAllKinAudience = useCallback(() => {
    setState((current) => ({
      ...current,
      audience: chooseAllKin(current.approvedKin.map((kin) => kin.id)),
    }));
  }, []);

  const chooseSelectedKinAudience = useCallback((kinIds: readonly KinId[]) => {
    setState((current) => ({ ...current, audience: chooseSelectedKin(kinIds) }));
  }, []);

  const markContinuedSolo = useCallback(() => {
    setState((current) => ({ ...current, continuedSolo: true }));
  }, []);

  const resetToColdStart = useCallback(() => {
    if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
    setState(INITIAL_STATE);
  }, []);

  const seedIdentityForReview = useCallback((username: string) => {
    if (savingTimeoutRef.current) clearTimeout(savingTimeoutRef.current);
    setState((current) => ({ ...current, identity: { status: 'saved', username } }));
  }, []);

  const seedApprovedKinForReview = useCallback((profiles: readonly KinProfile[]) => {
    setState((current) => ({ ...current, approvedKin: profiles, incoming: [], outgoing: [] }));
  }, []);

  const value = useMemo<SocialOnboardingContextValue>(
    () => ({
      state,
      beginSavingUsername,
      sendKinRequest,
      withdrawKinRequest,
      simulateOtherSessionAccepted,
      receiveIncomingRequest,
      acceptIncoming,
      declineIncoming,
      removeKin,
      sendInvitation,
      chooseOnlyMeAudience,
      chooseAllKinAudience,
      chooseSelectedKinAudience,
      markContinuedSolo,
      resetToColdStart,
      seedIdentityForReview,
      seedApprovedKinForReview,
    }),
    [
      state,
      beginSavingUsername,
      sendKinRequest,
      withdrawKinRequest,
      simulateOtherSessionAccepted,
      receiveIncomingRequest,
      acceptIncoming,
      declineIncoming,
      removeKin,
      sendInvitation,
      chooseOnlyMeAudience,
      chooseAllKinAudience,
      chooseSelectedKinAudience,
      markContinuedSolo,
      resetToColdStart,
      seedIdentityForReview,
      seedApprovedKinForReview,
    ],
  );

  return <SocialOnboardingContext.Provider value={value}>{children}</SocialOnboardingContext.Provider>;
}

export function useSocialOnboarding(): SocialOnboardingContextValue {
  const context = useContext(SocialOnboardingContext);
  if (!context) throw new Error('useSocialOnboarding must be used within a SocialOnboardingProvider');
  return context;
}
