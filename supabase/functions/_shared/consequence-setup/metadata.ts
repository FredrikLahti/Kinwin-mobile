/**
 * Stripe metadata for this flow carries only internal, opaque UUID
 * references — never goal, behavior, recipient names, invitation text, or
 * any other challenge content. Metadata is visible in the Stripe Dashboard
 * and to anyone with Stripe API access, so this boundary matters.
 */
export function buildSetupIntentMetadata(params: {
  readonly ownerId: string;
  readonly challengeId: string;
  readonly consequenceId: string;
}): Record<string, string> {
  return {
    kinwin_owner_id: params.ownerId,
    kinwin_challenge_id: params.challengeId,
    kinwin_consequence_id: params.consequenceId,
  };
}

export function buildCustomerMetadata(params: { readonly ownerId: string }): Record<string, string> {
  return { kinwin_owner_id: params.ownerId };
}
