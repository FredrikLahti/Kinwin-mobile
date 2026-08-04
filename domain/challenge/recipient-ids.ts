import type { RecipientId } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A local recipient id that already looks like a production UUID (i.e. it
 * came from a previously saved/loaded draft) is reused as-is; anything else
 * (a freshly minted ephemeral onboarding id) gets a new stable UUID via
 * `mintId`. This is what makes repeated saves of the same draft an upsert
 * (same recipient identities every time) instead of minting a fresh
 * duplicate recipient on every save.
 */
export function resolveRecipientIds(
  recipients: readonly { readonly id: string; readonly name: string }[],
  mintId: () => string,
): Record<string, RecipientId> {
  const recipientIds: Record<string, RecipientId> = {};
  for (const recipient of recipients) {
    recipientIds[recipient.id] = (UUID_PATTERN.test(recipient.id) ? recipient.id : mintId()) as RecipientId;
  }
  return recipientIds;
}

type RecipientLike = { readonly id: string; readonly name: string };
type RewardOrganizerLike =
  | { readonly type: 'recipient'; readonly recipientId: string }
  | { readonly type: 'other'; readonly name: string }
  | null;

/**
 * After a successful save, the caller's local recipient ids (ephemeral or
 * already-stable) must be replaced with the ids `resolveRecipientIds` actually
 * used, so a later save of the same draft sees UUID-shaped ids and reuses them
 * instead of minting new ones every time. `rewardOrganizer` is remapped too when
 * it points at one of the replaced recipients, so the "who organizes the reward"
 * selection keeps pointing at the same person instead of silently breaking.
 */
export function applyResolvedRecipientIds(
  recipients: readonly RecipientLike[],
  rewardOrganizer: RewardOrganizerLike,
  recipientIds: Readonly<Record<string, string>>,
): { readonly recipients: RecipientLike[]; readonly rewardOrganizer: RewardOrganizerLike } {
  const nextRecipients = recipients.map((recipient) => ({
    id: recipientIds[recipient.id] ?? recipient.id,
    name: recipient.name,
  }));
  const nextRewardOrganizer =
    rewardOrganizer?.type === 'recipient' && recipientIds[rewardOrganizer.recipientId]
      ? { type: 'recipient' as const, recipientId: recipientIds[rewardOrganizer.recipientId] }
      : rewardOrganizer;
  return { recipients: nextRecipients, rewardOrganizer: nextRewardOrganizer };
}
