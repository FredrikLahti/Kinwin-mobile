import { restoreOnboardingDraftData } from '@/domain/challenge/to-onboarding-draft';
import type { OnboardingDraftData } from '@/domain/challenge/from-onboarding-draft';
import type { ChallengeDraft } from '@/domain/challenge/types';

import { supabase } from './client';

function classifyError(error: { message: string }): { readonly kind: 'network' | 'unknown'; readonly message: string } {
  const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
  return { kind: isNetworkError ? 'network' : 'unknown', message: error.message };
}

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

export type PendingCommitmentRecipient = {
  readonly id: string;
  readonly displayName: string;
  readonly isOrganizer: boolean;
};

export type PendingCommitment = {
  readonly challengeId: string;
  /** Locked in at preparation time; the draft it came from is read-only from here on. */
  readonly draftData: OnboardingDraftData;
  readonly recipients: readonly PendingCommitmentRecipient[];
  readonly consequenceStatus: string;
  readonly stakeMinorUnits: number;
  readonly currency: string;
  /** Server-derived, webhook-authoritative — see docs/PRODUCT_DECISIONS.md's "Consequence payment setup" section. Never a client-side claim. */
  readonly authorizationStatus: string;
  readonly authorizedAt: string | null;
};

export type FetchPendingCommitmentResult =
  | { readonly ok: true; readonly commitment: PendingCommitment | null }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Reads the current user's latest `pending_activation` commitment, if any,
 * entirely through the SELECT grants and RLS policies already proven in
 * supabase/tests/020-040 and 100_cancel_pending_challenge.sql — no new
 * grant or policy exists for this. The challenge/recipients/consequence
 * rows carry the current, authoritative status and recipient list; the
 * goal/behavior/successRule/duration/experience category the summary also
 * needs only ever existed in the (now archived, read-only) source draft
 * `prepare_challenge_from_draft` left behind, so this reads that too and
 * restores it through the same anti-corruption boundary the draft editor
 * uses, reversed.
 */
export async function fetchPendingCommitment(userId: string): Promise<FetchPendingCommitmentResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('id, source_draft_id')
    .eq('owner_id', userId)
    .eq('challenge_status', 'pending_activation')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (challengeError) return { ok: false, ...classifyError(challengeError) };
  if (!challenge || !challenge.source_draft_id) return { ok: true, commitment: null };

  const [draftResult, recipientsResult, consequenceResult] = await Promise.all([
    supabase.from('challenge_drafts').select('draft_payload').eq('id', challenge.source_draft_id).maybeSingle(),
    supabase.from('challenge_recipients').select('id, display_name, recipient_role').eq('challenge_id', challenge.id).order('sort_order', { ascending: true }),
    supabase.from('consequences').select('status, stake_minor_units, currency, authorization_status, authorized_at').eq('challenge_id', challenge.id).maybeSingle(),
  ]);
  if (draftResult.error) return { ok: false, ...classifyError(draftResult.error) };
  if (recipientsResult.error) return { ok: false, ...classifyError(recipientsResult.error) };
  if (consequenceResult.error) return { ok: false, ...classifyError(consequenceResult.error) };
  if (!draftResult.data || !consequenceResult.data) {
    return { ok: false, kind: 'unknown', message: 'The pending commitment is missing expected data.' };
  }

  const draftData = restoreOnboardingDraftData(draftResult.data.draft_payload as ChallengeDraft);
  return {
    ok: true,
    commitment: {
      challengeId: challenge.id,
      draftData,
      recipients: (recipientsResult.data ?? []).map((recipient) => ({
        id: recipient.id,
        displayName: recipient.display_name,
        isOrganizer: recipient.recipient_role === 'recipient_organizer',
      })),
      consequenceStatus: consequenceResult.data.status,
      stakeMinorUnits: consequenceResult.data.stake_minor_units,
      currency: consequenceResult.data.currency,
      authorizationStatus: consequenceResult.data.authorization_status,
      authorizedAt: consequenceResult.data.authorized_at,
    },
  };
}

export type CancelPendingChallengeResult =
  | { readonly ok: true; readonly challengeId: string; readonly status: string }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Calls the trusted `cancel_pending_challenge` RPC (see
 * supabase/migrations/20260806000000_cancel_pending_challenge.sql).
 * Idempotent — calling it again for an already-canceled challenge returns
 * the same result — so retrying after a network error is always safe.
 */
export async function cancelPendingChallenge(challengeId: string, userId: string): Promise<CancelPendingChallengeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data, error } = await supabase.rpc('cancel_pending_challenge', { challenge_id: challengeId });
  if (error) return { ok: false, ...classifyError(error) };

  const result = data as { challengeId?: string; status?: string } | null;
  if (!result?.challengeId || !result.status) {
    return { ok: false, kind: 'unknown', message: 'The server did not confirm the cancellation.' };
  }
  return { ok: true, challengeId: result.challengeId, status: result.status };
}
