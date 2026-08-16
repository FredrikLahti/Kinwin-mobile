import { classifyDeleteAccountOutcome, DeleteAccountErrorResult, DeleteAccountOutcome } from './delete-account-errors';
import { supabase } from './client';

export type AccountDeletionEligibility =
  | { readonly ok: true; readonly eligible: true }
  | { readonly ok: true; readonly eligible: false; readonly reason: string }
  | { readonly ok: false };

/**
 * Reads public.check_account_deletion_eligibility directly — safe to call
 * without going through an Edge Function, since it is auth.uid()-scoped
 * and read-only, the same convention as get_owner_reward_progress/
 * get_owner_payment_status. This is the preflight only; the actual
 * deletion (deleteOwnAccount below) re-validates the same eligibility
 * server-side immediately before doing anything destructive.
 */
export async function checkAccountDeletionEligibility(): Promise<AccountDeletionEligibility> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.rpc('check_account_deletion_eligibility');
  if (error || !data || typeof data.eligible !== 'boolean') return { ok: false };
  if (data.eligible) return { ok: true, eligible: true };
  return { ok: true, eligible: false, reason: typeof data.reason === 'string' ? data.reason : 'unknown' };
}

export type DeleteAccountResult = { readonly ok: true } | ({ readonly ok: false } & DeleteAccountErrorResult);

/**
 * Calls the trusted `delete-account` Edge Function for the signed-in
 * user's own account (see supabase/functions/delete-account/index.ts).
 * The Edge Function derives the caller from the verified JWT that
 * supabase-js's `functions.invoke` already attaches from the current
 * session — this never sends or trusts any identity in the request body.
 */
export async function deleteOwnAccount(): Promise<DeleteAccountResult> {
  if (!supabase) return { ok: false, kind: 'unknown', message: 'Kinwin is not connected to a Supabase project yet.' };

  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    const name = (error as { name?: string }).name;
    const context = (error as { context?: Response }).context;
    const status = context && typeof context.status === 'number' ? context.status : null;
    let body: DeleteAccountOutcome['body'] = null;
    if (context && typeof context.json === 'function') {
      try {
        body = await context.json();
      } catch {
        body = null;
      }
    }
    const transport = name === 'FunctionsFetchError' ? 'fetch_error' : name === 'FunctionsRelayError' ? 'relay_error' : 'http_error';
    const outcome = classifyDeleteAccountOutcome({ transport, status, body });
    return { ok: false, ...outcome };
  }

  if (!(data as { deleted?: boolean } | null)?.deleted) {
    return { ok: false, kind: 'unknown', message: 'Something went wrong deleting your account. Try again.' };
  }
  return { ok: true };
}
