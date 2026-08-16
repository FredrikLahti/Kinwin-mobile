export type DeleteAccountErrorKind = 'not_authenticated' | 'ineligible' | 'network' | 'incomplete' | 'unknown';

export type DeleteAccountOutcome = {
  /** 'ok' means an HTTP 2xx was received; the JSON body is validated separately. */
  readonly transport: 'fetch_error' | 'relay_error' | 'http_error' | 'ok';
  readonly status: number | null;
  readonly body: { readonly error?: string; readonly message?: string } | null;
};

export type DeleteAccountErrorResult =
  /** `reason` is the same blocker token check_account_deletion_eligibility returns — map it with describeAccountDeletionBlocker, never show it raw. */
  | { readonly kind: 'ineligible'; readonly reason: string }
  | { readonly kind: Exclude<DeleteAccountErrorKind, 'ineligible'>; readonly message: string };

/**
 * Pure mapping from delete-account's own response shape (see
 * supabase/functions/delete-account/index.ts) to a user-facing outcome.
 * Dependency-free, same reasoning as lib/supabase/consequence-setup-errors.ts.
 */
export function classifyDeleteAccountOutcome(outcome: DeleteAccountOutcome): DeleteAccountErrorResult {
  if (outcome.transport === 'fetch_error' || outcome.transport === 'relay_error') {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }

  switch (outcome.body?.error) {
    case 'unauthorized':
      return { kind: 'not_authenticated', message: 'Sign in again to delete your account.' };
    case 'ineligible':
      return { kind: 'ineligible', reason: outcome.body.message ?? 'unknown' };
    case 'account_removal_incomplete':
      return {
        kind: 'incomplete',
        message: outcome.body.message ?? 'Your data was removed, but finishing account removal failed. Please try again or contact support.',
      };
    default:
      return { kind: 'unknown', message: 'Something went wrong deleting your account. Try again.' };
  }
}
