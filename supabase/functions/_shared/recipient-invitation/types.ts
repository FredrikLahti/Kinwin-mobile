export type RecipientInvitationStatus = 'ready' | 'sent' | 'accepted' | 'declined';
export type RecipientInvitationProjection = {
  readonly status: RecipientInvitationStatus;
  readonly ownerName: string;
  readonly recipientName: string;
  readonly goal: string;
  readonly behavior: string;
  readonly consequenceCategory: string;
  readonly ownerSitsOut: true;
};

export const RECIPIENT_PROJECTION_KEYS = ['status', 'ownerName', 'recipientName', 'goal', 'behavior', 'consequenceCategory', 'ownerSitsOut'] as const;
