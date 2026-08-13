import { ActivatedChallengeSnapshot } from '@/domain/challenge/types';
import { OwnerPaymentState, OwnerPaymentStatus } from '@/lib/payment-journey';
import { OwnerRewardProgress } from '@/lib/reward-journey';

import { supabase } from './client';

const VALID_PAYMENT_STATES: readonly OwnerPaymentState[] = ['not_applicable', 'processing', 'needs_attention', 'paid'];

export const TERMINAL_CHALLENGE_STATUSES = ['completed_success', 'completed_failure'] as const;
export type TerminalChallengeStatus = typeof TERMINAL_CHALLENGE_STATUSES[number];

export type CompletedChallenge = {
  readonly id: string;
  readonly status: TerminalChallengeStatus;
  readonly completedAt: string;
  readonly startsAt: string;
  readonly plannedEndsAt: string;
  readonly timezone: string;
  readonly snapshot: ActivatedChallengeSnapshot;
  readonly consequence: { readonly stakeMinorUnits: number; readonly currency: string } | null;
  readonly rewardProgress: OwnerRewardProgress | null;
  readonly paymentStatus: OwnerPaymentStatus | null;
};

export type FetchCompletedChallengeResult =
  | { readonly ok: true; readonly data: CompletedChallenge | null }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

type ChallengeRow = { id: string; challenge_status: TerminalChallengeStatus; completed_at: string; starts_at: string; planned_ends_at: string; timezone: string; activation_snapshot: Record<string, unknown> };

function classifyError(error: { message: string }) {
  const message = error.message;
  const lower = message.toLowerCase();
  return { kind: lower.includes('network') || lower.includes('fetch') ? 'network' as const : 'unknown' as const, message };
}

async function fetchCompletedChallengeRow(ownerId: string, challengeId?: string): Promise<FetchCompletedChallengeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!ownerId) return { ok: false, kind: 'not_authenticated' };

  let query = supabase.from('challenges')
    .select('id, challenge_status, completed_at, starts_at, planned_ends_at, timezone, activation_snapshot')
    .eq('owner_id', ownerId)
    .in('challenge_status', [...TERMINAL_CHALLENGE_STATUSES]);
  query = challengeId ? query.eq('id', challengeId) : query.order('completed_at', { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, ...classifyError(error) };
  if (!data?.activation_snapshot || !data.completed_at) return { ok: true, data: null };

  const row = data as ChallengeRow;
  const consequenceResult = await supabase.from('consequences')
    .select('stake_minor_units, currency').eq('challenge_id', row.id).eq('owner_id', ownerId).maybeSingle();
  if (consequenceResult.error) return { ok: false, ...classifyError(consequenceResult.error) };
  const progressResult = row.challenge_status === 'completed_failure'
    ? await supabase.rpc('get_owner_reward_progress', { p_challenge_id: row.id })
    : { data: null, error: null };
  if (progressResult.error) return { ok: false, ...classifyError(progressResult.error) };

  const paymentStatusResult = row.challenge_status === 'completed_failure'
    ? await supabase.rpc('get_owner_payment_status', { p_challenge_id: row.id })
    : { data: null, error: null };
  if (paymentStatusResult.error) return { ok: false, ...classifyError(paymentStatusResult.error) };
  const paymentState = (paymentStatusResult.data as { state?: unknown } | null)?.state;
  const paymentStatus: OwnerPaymentStatus | null = row.challenge_status === 'completed_failure'
    ? { state: typeof paymentState === 'string' && (VALID_PAYMENT_STATES as readonly string[]).includes(paymentState) ? (paymentState as OwnerPaymentState) : 'not_applicable' }
    : null;

  return { ok: true, data: {
    id: row.id, status: row.challenge_status, completedAt: row.completed_at, startsAt: row.starts_at,
    plannedEndsAt: row.planned_ends_at, timezone: row.timezone,
    snapshot: row.activation_snapshot as unknown as ActivatedChallengeSnapshot,
    consequence: consequenceResult.data ? { stakeMinorUnits: consequenceResult.data.stake_minor_units, currency: consequenceResult.data.currency } : null,
    rewardProgress: progressResult.data as OwnerRewardProgress | null,
    paymentStatus,
  } };
}

/** Reads terminal server truth without treating it as an active challenge. */
export function fetchRecentCompletedChallenge(ownerId: string): Promise<FetchCompletedChallengeResult> {
  return fetchCompletedChallengeRow(ownerId);
}

/** The owner filter is deliberate defense in depth in addition to challenge RLS. */
export function fetchCompletedChallenge(ownerId: string, challengeId: string): Promise<FetchCompletedChallengeResult> {
  if (!challengeId) return Promise.resolve({ ok: true, data: null });
  return fetchCompletedChallengeRow(ownerId, challengeId);
}
