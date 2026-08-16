/**
 * Pure decision logic behind supabase/functions/delete-account/index.ts —
 * kept separate and Deno/Node-agnostic so it is unit-testable without a
 * live database, matching the pattern used throughout supabase/functions/
 * (e.g. _shared/consequence-setup/setup-intent-flow.ts).
 */

export type RpcError = { readonly code?: string; readonly message?: string };

export type ErrorResponseShape = {
  readonly status: number;
  readonly body: { readonly error: string; readonly message?: string };
};

/**
 * Maps delete_account_owned_data's own rejection (a Postgres SQLSTATE
 * surfaced through PostgREST) to this endpoint's response — never a raw
 * internal error to the caller. '22023' is raised by
 * private.account_deletion_blocker with the blocker reason token itself
 * as the message (e.g. 'active_challenge'), so it is passed through
 * verbatim for the client to map to real copy (lib/account-deletion.ts) —
 * never a raw database status string.
 */
export function classifyDeletionRpcError(error: RpcError): ErrorResponseShape {
  switch (error.code) {
    case '22023':
      return { status: 409, body: { error: 'ineligible', message: error.message } };
    case '28000':
      return { status: 401, body: { error: 'unauthorized' } };
    default:
      return { status: 500, body: { error: 'internal_error' } };
  }
}

export type AdminApiError = { readonly status?: number; readonly message?: string };

/**
 * Whether a failed auth.admin.deleteUser call means the account is
 * already gone (a previous attempt already finished this exact step — a
 * retried request, or a response lost after success) rather than a real
 * failure. Idempotency requires treating this as success: a fresh caller
 * must never be told their account still exists when it doesn't, and a
 * genuine failure must never be swallowed as if it were this case.
 */
export function isUserAlreadyRemoved(error: AdminApiError): boolean {
  if (error.status === 404) return true;
  return /not.?found/i.test(error.message ?? '');
}
