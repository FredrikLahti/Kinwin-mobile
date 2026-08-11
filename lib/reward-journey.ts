export type OwnerRewardState = 'waiting_for_organizer' | 'preparing' | 'ready' | 'needs_attention';

export type OwnerRewardProgress = {
  readonly state: OwnerRewardState;
  readonly organizerName: string;
  readonly organizerIsRecipient: boolean;
};

export type RewardStatusPresentation = {
  readonly label: string;
  readonly detail: string;
  readonly tone: 'neutral' | 'success' | 'attention';
};

export function describeOwnerRewardStatus(progress: OwnerRewardProgress): RewardStatusPresentation {
  switch (progress.state) {
    case 'waiting_for_organizer': return { label: `Waiting for ${progress.organizerName}`, detail: 'Share their private access so they can accept the organizer role.', tone: 'neutral' };
    case 'preparing': return { label: 'Preparing their reward', detail: `${progress.organizerName} will be able to open it when it is ready.`, tone: 'neutral' };
    case 'ready': return { label: 'Reward ready', detail: `${progress.organizerName} can now open the reward from their private access.`, tone: 'success' };
    case 'needs_attention': return { label: 'Reward needs attention', detail: 'The challenge result is final. Kinwin still needs to finish preparing the reward.', tone: 'attention' };
  }
}

export function recipientRoleLabel(accessRole: 'recipient' | 'organizer', recipientName: string | null): string {
  if (accessRole === 'organizer' && recipientName) return 'RECIPIENT AND REWARD ORGANIZER';
  return accessRole === 'organizer' ? 'REWARD ORGANIZER' : 'REWARD RECIPIENT';
}

export function canOpenOrganizerReward(input: { readonly accessRole: 'recipient' | 'organizer'; readonly invitationStatus: string; readonly rewardStatus: string | null }): boolean {
  return input.accessRole === 'organizer' && input.invitationStatus === 'accepted' && input.rewardStatus === 'ready';
}

export function rewardLinkErrorMessage(kind: 'unavailable' | 'cooldown' | 'temporary'): string {
  if (kind === 'cooldown') return 'The reward is already opening. Wait a moment before trying again.';
  if (kind === 'unavailable') return 'This reward is not ready for this invitation.';
  return 'The reward could not be opened right now. Please try again.';
}

export function formatPeople(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? 'Your recipients';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
