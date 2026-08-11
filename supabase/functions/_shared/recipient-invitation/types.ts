export type RecipientInvitationStatus = 'ready' | 'sent' | 'accepted' | 'declined';
export type RecipientInvitationProjection = {
  readonly status: RecipientInvitationStatus;
  readonly ownerName: string;
  readonly recipientName: string | null;
  readonly goal: string;
  readonly behavior: string;
  readonly consequenceCategory: string;
  readonly ownerSitsOut: true;
  readonly accessRole: 'recipient' | 'organizer';
  readonly organizerName: string | null;
  readonly recipientNames: readonly string[];
};

export const RECIPIENT_PROJECTION_KEYS = ['status','ownerName','recipientName','goal','behavior','consequenceCategory','ownerSitsOut','accessRole','organizerName','recipientNames'] as const;
