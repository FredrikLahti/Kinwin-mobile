export type DraftSaveErrorClassification =
  // A concurrent tab/session already turned this same draft into a pending
  // commitment, so the immutable-archived-row trigger fired. This is an
  // expected business signal the caller resumes from (see
  // app/create/review.tsx) — never a raw message to show the user.
  | { readonly kind: 'archived' }
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'unknown'; readonly message: string };

/** Classifies a raw Supabase/Postgres error message without ever repeating its raw text to the user. */
export function classifyDraftSaveError(rawMessage: string): DraftSaveErrorClassification {
  const text = rawMessage.toLowerCase();
  if (text.includes('archived')) return { kind: 'archived' };
  if (text.includes('network') || text.includes('fetch')) {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }
  return { kind: 'unknown', message: 'Something went wrong. Try again.' };
}
