import { ActivatedChallengeSnapshot } from '@/domain/challenge/types';

import { supabase } from './client';

function classifyError(error: { message: string }): { readonly kind: 'network' | 'unknown'; readonly message: string } {
  const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
  return { kind: isNetworkError ? 'network' : 'unknown', message: error.message };
}

export type KinConnectionStatus = 'pending' | 'accepted';

export type KinConnection = {
  readonly connectionId: string;
  readonly otherUserId: string;
  readonly otherDisplayName: string;
  readonly status: KinConnectionStatus;
  /** Only meaningful while status is 'pending': did I send this, or did I receive it? */
  readonly direction: 'incoming' | 'outgoing';
};

export type FetchKinResult =
  | { readonly ok: true; readonly connections: readonly KinConnection[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Reads every real, non-removed, non-blocked connection the current user is
 * part of (see public.kin_connections' own RLS —
 * supabase/migrations/20260814000000_kin_connections.sql — this only ever
 * returns rows RLS already scoped to the caller). PostgREST can't embed
 * `profiles` here in one call: kin_connections has two separate foreign
 * keys into auth.users, which is ambiguous for automatic embedding, and
 * auth.users itself isn't exposed anyway — so this reads the connection
 * rows, then batch-fetches the other party's display_name from `profiles`
 * (readable per-row via the new profiles_select_kin policy, same migration).
 */
export async function fetchKinConnections(userId: string): Promise<FetchKinResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: rows, error } = await supabase
    .from('kin_connections')
    .select('id, requester_id, recipient_id, status')
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });
  if (error) return { ok: false, ...classifyError(error) };
  if (!rows || rows.length === 0) return { ok: true, connections: [] };

  const otherIds = Array.from(new Set(rows.map((row) => (row.requester_id === userId ? row.recipient_id : row.requester_id))));
  const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id, display_name').in('id', otherIds);
  if (profileError) return { ok: false, ...classifyError(profileError) };

  const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.display_name as string | null]));
  const connections: readonly KinConnection[] = rows.map((row) => {
    const otherUserId = row.requester_id === userId ? row.recipient_id : row.requester_id;
    return {
      connectionId: row.id,
      otherUserId,
      otherDisplayName: nameById.get(otherUserId) ?? 'Your Kin',
      status: row.status as KinConnectionStatus,
      direction: row.requester_id === userId ? 'outgoing' : 'incoming',
    };
  });
  return { ok: true, connections };
}

export type FetchMyKinCodeResult =
  | { readonly ok: true; readonly kinCode: string }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/** The current user's own shareable code (see profiles.kin_code, same migration) — never anyone else's. */
export async function fetchMyKinCode(userId: string): Promise<FetchMyKinCodeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data, error } = await supabase.from('profiles').select('kin_code').eq('id', userId).maybeSingle();
  if (error) return { ok: false, ...classifyError(error) };
  if (!data?.kin_code) return { ok: false, kind: 'unknown', message: 'No Kin code found for this account.' };
  return { ok: true, kinCode: data.kin_code };
}

export type RedeemKinCodeResult =
  | { readonly ok: true; readonly status: 'requested' | 'already_pending' | 'already_kin' }
  | { readonly ok: false; readonly kind: 'not_configured' | 'rejected'; readonly message?: string }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/** Calls the trusted redeem_kin_code RPC — sends a connection request to the code's owner. */
export async function redeemKinCode(code: string): Promise<RedeemKinCodeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.rpc('redeem_kin_code', { p_code: code });
  if (error) return { ok: false, kind: 'rejected', message: error.message };

  const result = data as { status?: string } | null;
  if (result?.status === 'requested' || result?.status === 'already_pending' || result?.status === 'already_kin') {
    return { ok: true, status: result.status };
  }
  return { ok: false, kind: 'unknown', message: 'The server did not confirm the request.' };
}

export type KinActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'not_configured' | 'rejected'; readonly message?: string }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

async function callConnectionRpc(name: string, args: Record<string, unknown>): Promise<KinActionResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  const { error } = await supabase.rpc(name, args);
  if (error) return { ok: false, kind: 'rejected', message: error.message };
  return { ok: true };
}

export const acceptKinRequest = (connectionId: string) => callConnectionRpc('accept_kin_request', { p_connection_id: connectionId });
export const declineKinRequest = (connectionId: string) => callConnectionRpc('decline_kin_request', { p_connection_id: connectionId });
export const cancelKinRequest = (connectionId: string) => callConnectionRpc('cancel_kin_request', { p_connection_id: connectionId });
export const removeKin = (connectionId: string) => callConnectionRpc('remove_kin', { p_connection_id: connectionId });
export const blockKin = (otherUserId: string) => callConnectionRpc('block_kin', { p_user_id: otherUserId });

export type ActivityKind = 'challenge_started' | 'challenge_succeeded' | 'challenge_failed';

export type ActivityBehaviorPayload = ActivatedChallengeSnapshot['behavior'];
export type ActivityDurationPayload = { readonly unit: string; readonly value: number };

export type ActivityItem = {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly kind: ActivityKind;
  readonly behavior: ActivityBehaviorPayload;
  readonly duration: ActivityDurationPayload | null;
  /** Only present on challenge_failed — the safe, product-approved consequence facts (never payment/contact data). */
  readonly consequence: {
    readonly recipientNames: readonly string[];
    readonly category: ActivatedChallengeSnapshot['consequenceCategory'];
    readonly stake: { readonly minorUnits: number; readonly currency: string };
  } | null;
  readonly createdAt: string;
  readonly reactionCounts: Readonly<Record<string, number>>;
  readonly myReaction: string | null;
};

export type FetchActivityResult =
  | { readonly ok: true; readonly items: readonly ActivityItem[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * The Kin activity feed: every social_activity row RLS already scoped to
 * the caller (own activity plus accepted Kin's — see 20260815000000's
 * select policy), newest first, capped at a small, restrained window —
 * this is meant to feel like a short list of recent moments, never an
 * endless feed. Reactions are fetched separately (same RLS shape) and
 * folded in client-side into per-activity counts plus "did I react".
 */
export async function fetchKinActivity(userId: string, limit = 30): Promise<FetchActivityResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: rows, error } = await supabase
    .from('social_activity')
    .select('id, owner_id, kind, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, ...classifyError(error) };
  if (!rows || rows.length === 0) return { ok: true, items: [] };

  const ownerIds = Array.from(new Set(rows.map((row) => row.owner_id)));
  const activityIds = rows.map((row) => row.id);
  const [profilesResult, reactionsResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', ownerIds),
    supabase.from('activity_reactions').select('activity_id, user_id, kind').in('activity_id', activityIds),
  ]);
  if (profilesResult.error) return { ok: false, ...classifyError(profilesResult.error) };
  if (reactionsResult.error) return { ok: false, ...classifyError(reactionsResult.error) };

  const nameById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name as string | null]));
  const reactionsByActivity = new Map<string, { activity_id: string; user_id: string; kind: string }[]>();
  for (const reaction of reactionsResult.data ?? []) {
    const existing = reactionsByActivity.get(reaction.activity_id) ?? [];
    existing.push(reaction);
    reactionsByActivity.set(reaction.activity_id, existing);
  }

  const items: readonly ActivityItem[] = rows.map((row) => {
    const payload = row.payload as Record<string, unknown>;
    const reactions = reactionsByActivity.get(row.id) ?? [];
    const reactionCounts: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const reaction of reactions) {
      reactionCounts[reaction.kind] = (reactionCounts[reaction.kind] ?? 0) + 1;
      if (reaction.user_id === userId) myReaction = reaction.kind;
    }
    const consequencePayload = payload.recipients && payload.stake ? payload : null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      ownerDisplayName: nameById.get(row.owner_id) ?? 'Your Kin',
      kind: row.kind as ActivityKind,
      behavior: payload.behavior as ActivityBehaviorPayload,
      duration: (payload.duration as ActivityDurationPayload | undefined) ?? null,
      consequence: consequencePayload
        ? {
            recipientNames: (consequencePayload.recipients as readonly { name: string }[]).map((r) => r.name),
            category: consequencePayload.consequenceCategory as ActivatedChallengeSnapshot['consequenceCategory'],
            stake: consequencePayload.stake as { minorUnits: number; currency: string },
          }
        : null,
      createdAt: row.created_at,
      reactionCounts,
      myReaction,
    };
  });
  return { ok: true, items };
}

export const REACTION_KINDS = ['respect', 'nice', 'worth_it', 'ouch', 'brutal'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export type ReactionActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/** Toggles the caller's own reaction: setting a new kind replaces any existing one (one reaction per user per activity — see the table's own unique constraint). */
export async function setMyReaction(userId: string, activityId: string, kind: ReactionKind): Promise<ReactionActionResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { error: deleteError } = await supabase.from('activity_reactions').delete().eq('activity_id', activityId).eq('user_id', userId);
  if (deleteError) return { ok: false, ...classifyError(deleteError) };

  const { error: insertError } = await supabase.from('activity_reactions').insert({ activity_id: activityId, user_id: userId, kind });
  if (insertError) return { ok: false, ...classifyError(insertError) };
  return { ok: true };
}

export async function clearMyReaction(userId: string, activityId: string): Promise<ReactionActionResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { error } = await supabase.from('activity_reactions').delete().eq('activity_id', activityId).eq('user_id', userId);
  if (error) return { ok: false, ...classifyError(error) };
  return { ok: true };
}
