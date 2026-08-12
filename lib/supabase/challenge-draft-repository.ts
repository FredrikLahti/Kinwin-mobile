import * as Crypto from 'expo-crypto';

import { mapOnboardingDraft, OnboardingDraftData, DraftMappingIssue } from '@/domain/challenge/from-onboarding-draft';
import { resolveRecipientIds } from '@/domain/challenge/recipient-ids';
import { restoreOnboardingDraftData } from '@/domain/challenge/to-onboarding-draft';
import type { ChallengeDraft } from '@/domain/challenge/types';

import { classifyDraftSaveError } from './classify-draft-save-error';
import { supabase } from './client';
import { planDraftMutation } from './draft-mutation';

export type SaveDraftInput = {
  readonly data: OnboardingDraftData;
  readonly recipients: readonly { readonly id: string; readonly name: string }[];
  readonly existingDraftId: string | null;
  readonly userId: string;
};

export type SaveDraftResult =
  | { readonly ok: true; readonly draft: ChallengeDraft; readonly recipientIds: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly kind: 'invalid'; readonly issues: readonly DraftMappingIssue[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  // See classifyDraftSaveError: a concurrent tab/session already archived
  // this draft. Callers resume the real commitment (app/create/review.tsx)
  // rather than showing an error.
  | { readonly ok: false; readonly kind: 'archived' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Saves a complete, normalized ChallengeDraft through the same
 * mapOnboardingDraft anti-corruption boundary the domain layer already
 * defines. Only ever writes the caller's own draft (challenge_drafts RLS
 * additionally enforces this server-side); reuses stable recipient/draft
 * IDs across repeated saves instead of minting new ones every time.
 */
export async function saveChallengeDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!input.userId) return { ok: false, kind: 'not_authenticated' };

  const draftId = input.existingDraftId ?? Crypto.randomUUID();
  const recipientIds = resolveRecipientIds(input.recipients, () => Crypto.randomUUID());

  const mapped = mapOnboardingDraft(input.data, {
    draftId: draftId as ChallengeDraft['id'],
    ownerId: input.userId as ChallengeDraft['ownerId'],
    recipientIds,
  });
  if (!mapped.ok) return { ok: false, kind: 'invalid', issues: mapped.issues };

  const plan = planDraftMutation(input.existingDraftId, draftId, input.userId, mapped.value);
  const { error } =
    plan.kind === 'insert'
      ? await supabase.from('challenge_drafts').insert(plan.row)
      : await supabase.from('challenge_drafts').update(plan.row).eq('id', plan.id);

  if (error) {
    const classification = classifyDraftSaveError(error.message);
    return classification.kind === 'archived'
      ? { ok: false, kind: 'archived' }
      : { ok: false, kind: classification.kind, message: classification.message };
  }

  return { ok: true, draft: mapped.value, recipientIds };
}

export type LoadDraftResult =
  | { readonly ok: true; readonly draftId: string; readonly data: OnboardingDraftData }
  | { readonly ok: true; readonly draftId: null; readonly data: null }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/** Loads the current user's most recent non-archived draft, if any. */
export async function fetchLatestEditableDraft(userId: string): Promise<LoadDraftResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data, error } = await supabase
    .from('challenge_drafts')
    .select('id, draft_payload')
    .eq('owner_id', userId)
    .neq('draft_status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
    return isNetworkError
      ? { ok: false, kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' }
      : { ok: false, kind: 'unknown', message: 'Something went wrong. Try again.' };
  }
  if (!data) return { ok: true, draftId: null, data: null };

  const draft = data.draft_payload as ChallengeDraft;
  return { ok: true, draftId: data.id, data: restoreOnboardingDraftData(draft) };
}
