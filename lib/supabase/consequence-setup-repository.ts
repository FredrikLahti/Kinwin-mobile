import { classifyCreateSetupIntentOutcome, CreateSetupIntentOutcome, SetupIntentErrorKind } from './consequence-setup-errors';
import { supabase } from './client';

export type { SetupIntentErrorKind } from './consequence-setup-errors';

export type CreateSetupIntentResult =
  | { readonly ok: true; readonly consequenceId: string; readonly clientSecret: string }
  | { readonly ok: false; readonly kind: SetupIntentErrorKind; readonly message: string };

/**
 * Calls the trusted `create-consequence-setup-intent` Edge Function for the
 * signed-in owner's own pending commitment (see
 * supabase/functions/create-consequence-setup-intent/index.ts,
 * docs/PAYMENT_SETUP.md). The Edge Function derives the caller from the
 * verified JWT that supabase-js's `functions.invoke` already attaches from
 * the current session — this never sends or trusts any identity in the
 * request body. The returned client secret is handed straight back to the
 * caller to feed into PaymentSheet; it is never logged or persisted here.
 */
export async function createConsequenceSetupIntent(challengeId: string, userId: string): Promise<CreateSetupIntentResult> {
  if (!supabase) return { ok: false, kind: 'not_configured', message: 'Kinwin is not connected to a Supabase project yet.' };
  if (!userId) return { ok: false, kind: 'not_authenticated', message: 'Sign in to continue payment setup.' };

  const { data, error } = await supabase.functions.invoke('create-consequence-setup-intent', { body: { challengeId } });
  if (error) {
    const name = (error as { name?: string }).name;
    const context = (error as { context?: Response }).context;
    const status = context && typeof context.status === 'number' ? context.status : null;
    let body: CreateSetupIntentOutcome['body'] = null;
    if (context && typeof context.json === 'function') {
      try {
        body = await context.json();
      } catch {
        body = null;
      }
    }
    const transport = name === 'FunctionsFetchError' ? 'fetch_error' : name === 'FunctionsRelayError' ? 'relay_error' : 'http_error';
    const { kind, message } = classifyCreateSetupIntentOutcome({ transport, status, body });
    return { ok: false, kind, message };
  }

  const result = data as { consequenceId?: string; clientSecret?: string } | null;
  if (!result?.consequenceId || !result.clientSecret) {
    return { ok: false, kind: 'malformed_response', message: 'The server did not return a valid payment setup response.' };
  }
  return { ok: true, consequenceId: result.consequenceId, clientSecret: result.clientSecret };
}
