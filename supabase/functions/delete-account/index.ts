// Authenticated Edge Function: the one trusted server-side boundary for a
// user to delete their own Kinwin account. The caller is derived entirely
// from their own verified Supabase JWT (withSupabase's `ctx.userClaims.id`)
// — never from the request body, which carries no identity at all — so
// this can only ever delete the caller's own account. See
// docs/ACCOUNT_DELETION_DECISIONS.md for the product decisions this
// implements and supabase/migrations/20260903000000_account_deletion.sql
// for the trusted RPCs and the ordered delete this orchestrates.
//
// The read-only preflight (public.check_account_deletion_eligibility) is
// NOT called from here — it is auth.uid()-scoped and safe for the client
// to call directly (supabase.rpc(...)), the same way
// get_owner_reward_progress/get_owner_payment_status already are.
// Calling it through this function's service-role client would break that
// scoping (auth.uid() does not resolve to the original end user inside a
// service-role-authenticated call), so this function only ever does the
// real, destructive thing.
//
// Sequencing: private.delete_account_owned_data re-validates every
// blocker server-side inside one transaction with row locks (never trusts
// that a client-side preflight is still true), and only once every owned
// row is verifiably gone does this function call the Supabase Admin API
// to remove the auth.users row itself — last, and only after everything
// that could reference it no longer exists.
import { withSupabase } from 'npm:@supabase/server@^1';

import { classifyDeletionRpcError, isUserAlreadyRemoved } from '../_shared/account-deletion/delete-account-flow.ts';

function jsonError(status: number, error: string, message?: string): Response {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

export default {
  // The `any` Database generic (overriding withSupabase's own `unknown`
  // default) is deliberate: this backend has no generated Supabase
  // Database type — matches every other function in this codebase.
  fetch: withSupabase<any>({ auth: 'user' }, async (_req, ctx) => {
    const ownerId = ctx.userClaims?.id;
    if (!ownerId) {
      return jsonError(401, 'unauthorized');
    }

    const { error: deleteError } = await ctx.supabaseAdmin.rpc('delete_account_owned_data', { p_owner_id: ownerId });
    if (deleteError) {
      if (deleteError.code !== '22023') {
        console.error('delete-account: delete_account_owned_data failed', deleteError.code);
      }
      const { status, body } = classifyDeletionRpcError(deleteError);
      return Response.json(body, { status });
    }

    // Every owned row is verifiably gone at this point — the RPC above
    // committed, or this request already returned above without touching
    // anything. Only now is it safe to remove the identity row itself.
    const { error: adminError } = await ctx.supabaseAdmin.auth.admin.deleteUser(ownerId);
    if (adminError && !isUserAlreadyRemoved(adminError)) {
      // The owned-data deletion already committed and cannot be undone
      // from here — but the account itself still exists, so this must
      // never be reported as success. A retry (by the client, or the
      // user tapping again) re-enters this same function: the data
      // deletion above becomes a no-op the second time (nothing left to
      // match), and this same Admin API call is retried.
      console.error('delete-account: Admin API deleteUser failed after data deletion committed', adminError.message);
      return jsonError(
        502,
        'account_removal_incomplete',
        'Your data was removed, but finishing account removal failed. Please try again or contact support.',
      );
    }

    return Response.json({ deleted: true });
  }),
};
