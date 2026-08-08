export type SetupIntentErrorKind =
  | 'not_configured'
  | 'not_authenticated'
  | 'not_found'
  | 'invalid_state'
  | 'network'
  | 'provider_error'
  | 'server_configuration_error'
  | 'malformed_response'
  | 'unknown';

export type CreateSetupIntentOutcome = {
  /** 'ok' means an HTTP 2xx was received; the JSON body is validated separately. */
  readonly transport: 'fetch_error' | 'relay_error' | 'http_error' | 'ok';
  readonly status: number | null;
  readonly body: { readonly error?: string; readonly message?: string } | null;
};

/**
 * Pure mapping from create-consequence-setup-intent's own response shape
 * (see supabase/functions/create-consequence-setup-intent/index.ts's
 * jsonError/rpcErrorResponse) to a user-facing error kind. Kept in its own
 * dependency-free file — unlike consequence-setup-repository.ts, this
 * never imports the Supabase client (and therefore never react-native or
 * AsyncStorage) — so it is unit testable with plain `node --test`, the
 * same reasoning supabase/functions/_shared/consequence-setup/*.ts already
 * documents for keeping orchestration logic separate from its runtime
 * wiring.
 */
export function classifyCreateSetupIntentOutcome(outcome: CreateSetupIntentOutcome): { readonly kind: SetupIntentErrorKind; readonly message: string } {
  if (outcome.transport === 'fetch_error' || outcome.transport === 'relay_error') {
    return { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' };
  }

  switch (outcome.body?.error) {
    case 'not_found':
      return { kind: 'not_found', message: 'This commitment could not be found. It may have already been canceled.' };
    case 'invalid_state':
      return { kind: 'invalid_state', message: 'This commitment is no longer in a state that supports payment setup.' };
    case 'unauthorized':
      return { kind: 'not_authenticated', message: 'Sign in again to continue payment setup.' };
    case 'server_configuration_error':
      return { kind: 'server_configuration_error', message: 'Payment setup is not available right now. Try again later.' };
    case 'payment_provider_error':
      return { kind: 'provider_error', message: 'Stripe could not be reached. Try again.' };
    default:
      return { kind: 'unknown', message: 'Something went wrong starting payment setup. Try again.' };
  }
}
