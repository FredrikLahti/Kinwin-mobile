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
