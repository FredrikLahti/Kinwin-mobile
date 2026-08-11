export type TremendousFulfillment = {
  readonly obligationId: string;
  readonly idempotencyKey: string;
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly organizerName: string;
  readonly recipientNames: readonly string[];
  readonly category: string;
};

export type TremendousCreatedReward = {
  readonly orderId: string;
  readonly rewardId: string;
  readonly redemptionUrl: string;
};

export type TremendousResult =
  | { readonly ok: true; readonly reward: TremendousCreatedReward }
  | { readonly ok: false; readonly retryable: boolean; readonly code: string };
