import { ChallengeId, ConsequenceId, CurrencyCode, IsoDateTime, UserId } from '../challenge/types';

export type ConsequenceState =
  | 'draft' | 'payment_method_required' | 'authorized' | 'active' | 'charge_pending'
  | 'charged' | 'reward_fulfillment_pending' | 'reward_delivered' | 'failed_payment'
  | 'canceled_before_activation';

export type ChargeAttemptMetadata = {
  readonly attemptNumber: number;
  readonly attemptedAt: IsoDateTime;
  readonly idempotencyKey: string;
  readonly providerReference: string | null;
  readonly outcome: 'pending' | 'succeeded' | 'failed';
};

export type Consequence = {
  readonly schemaVersion: 1;
  readonly id: ConsequenceId;
  readonly challengeId: ChallengeId | null;
  readonly ownerId: UserId;
  readonly state: ConsequenceState;
  readonly stake: { readonly minorUnits: number; readonly currency: CurrencyCode };
  readonly paymentProviderCustomerReference: string | null;
  readonly paymentProviderMethodReference: string | null;
  readonly authorizationReference: string | null;
  readonly authorizedAt: IsoDateTime | null;
  readonly latestChargeAttempt: ChargeAttemptMetadata | null;
  readonly fulfillmentProviderReference: string | null;
};

// Only trusted server evaluation may authorize an idempotent transition to charge_pending.
