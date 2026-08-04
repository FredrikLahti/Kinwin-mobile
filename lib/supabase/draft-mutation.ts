import type { ChallengeDraft } from '@/domain/challenge/types';

export type DraftRow = {
  readonly schema_version: 1;
  readonly draft_payload: ChallengeDraft;
  readonly draft_status: 'ready_for_activation';
};

export type DraftMutationPlan =
  | { readonly kind: 'insert'; readonly row: DraftRow & { readonly id: string; readonly owner_id: string } }
  | { readonly kind: 'update'; readonly id: string; readonly row: DraftRow };

/**
 * `authenticated` only holds UPDATE grants on schema_version/draft_payload/draft_status
 * (not id/owner_id — see the initial migration's grants), so sending every save as an
 * upsert makes PostgREST's ON CONFLICT DO UPDATE branch require update privilege on
 * columns it never actually needs to change, and Postgres rejects it. Deciding the
 * operation client-side instead avoids ever attempting to update id/owner_id: insert
 * the full row for a genuinely new draft id, or update only the mutable columns for
 * an existing one.
 */
export function planDraftMutation(
  existingDraftId: string | null,
  draftId: string,
  ownerId: string,
  draft: ChallengeDraft,
): DraftMutationPlan {
  const row: DraftRow = {
    schema_version: draft.schemaVersion,
    draft_payload: draft,
    draft_status: 'ready_for_activation',
  };
  if (existingDraftId === null) {
    return { kind: 'insert', row: { ...row, id: draftId, owner_id: ownerId } };
  }
  return { kind: 'update', id: existingDraftId, row };
}
