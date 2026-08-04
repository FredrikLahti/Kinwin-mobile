import { supabase } from './client';

export type PrepareChallengeFromDraftResult =
  | { readonly ok: true; readonly challengeId: string; readonly status: string }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Calls the trusted `prepare_challenge_from_draft` RPC (see
 * supabase/migrations/20260805000000_prepare_challenge_from_draft.sql) after
 * a draft has been saved as ready_for_activation. The server — never this
 * client — loads the draft, revalidates it, and atomically creates a
 * server-owned `challenges` row with status `pending_activation`, its
 * recipients, and a pre-payment `consequences` row; there is no client write
 * grant on any of those tables. Calling this again for the same draft
 * returns the same challenge instead of creating a duplicate.
 */
export async function prepareChallengeFromDraft(draftId: string, userId: string): Promise<PrepareChallengeFromDraftResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data, error } = await supabase.rpc('prepare_challenge_from_draft', { draft_id: draftId });
  if (error) {
    const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
    return { ok: false, kind: isNetworkError ? 'network' : 'unknown', message: error.message };
  }

  const result = data as { challengeId?: string; status?: string } | null;
  if (!result?.challengeId || !result.status) {
    return { ok: false, kind: 'unknown', message: 'The server did not return a prepared challenge.' };
  }
  return { ok: true, challengeId: result.challengeId, status: result.status };
}
