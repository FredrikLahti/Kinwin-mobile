import { OwnerPaymentState, OwnerPaymentStatus } from '@/lib/payment-journey';

import { supabase } from './client';

export type FetchOwnerPaymentStatusResult =
  | { readonly ok: true; readonly value: OwnerPaymentStatus }
  | { readonly ok: false; readonly message: string };

const VALID_STATES: readonly OwnerPaymentState[] = ['not_applicable', 'processing', 'needs_attention', 'paid'];

/**
 * Reads the coarse, owner-scoped payment-recovery projection from
 * `get_owner_payment_status` (see
 * supabase/migrations/20260901000000_owner_payment_recovery.sql). Never
 * exposes provider ids or raw Stripe/database error text — an
 * unrecognized or missing state collapses to 'not_applicable' rather than
 * surfacing anything unvalidated to the UI.
 */
export async function fetchOwnerPaymentStatus(challengeId: string): Promise<FetchOwnerPaymentStatusResult> {
  if (!supabase) return { ok: false, message: 'Kinwin is not connected to a Supabase project yet.' };
  const { data, error } = await supabase.rpc('get_owner_payment_status', { p_challenge_id: challengeId });
  if (error) return { ok: false, message: error.message };
  const state = (data as { state?: unknown } | null)?.state;
  const resolved = typeof state === 'string' && (VALID_STATES as readonly string[]).includes(state) ? (state as OwnerPaymentState) : 'not_applicable';
  return { ok: true, value: { state: resolved } };
}
