import { ActivatedChallengeSnapshot } from '@/domain/challenge/types';
import { validateCommentBody } from '@/lib/social/comment-validation';

import { supabase } from './client';

function classifyError(error: { message: string }): { readonly kind: 'network' | 'unknown'; readonly message: string } {
  const isNetworkError = error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch');
  return isNetworkError
    ? { kind: 'network', message: 'Could not reach Kinwin. Check your connection and try again.' }
    : { kind: 'unknown', message: 'Something went wrong. Try again.' };
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

export type KinSearchConnectionStatus = 'none' | 'pending' | 'accepted' | 'blocked';

export type KinSearchResult = {
  readonly userId: string;
  readonly displayName: string;
  readonly connectionStatus: KinSearchConnectionStatus;
  readonly connectionDirection: 'incoming' | 'outgoing' | null;
  readonly connectionId: string | null;
};

export type SearchKinResult =
  | { readonly ok: true; readonly results: readonly KinSearchResult[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'rejected'; readonly message?: string }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * The primary Add-Kin flow: person lookup by display name (prefix) or
 * exact email, via the server-authorized search_kin_candidates RPC (see
 * supabase/migrations/20260817000000_kin_search_and_current_state.sql —
 * exact email match only, never partial, and no email value is ever
 * returned). Not a directory: results are small and carry only what's
 * needed to identify someone and choose an action.
 */
export async function searchKin(query: string): Promise<SearchKinResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.rpc('search_kin_candidates', { p_query: query });
  if (error) return { ok: false, kind: 'rejected', message: error.message };

  const rows = (data ?? []) as readonly {
    id: string;
    display_name: string | null;
    connection_status: string;
    connection_direction: string | null;
    connection_id: string | null;
  }[];
  const results: readonly KinSearchResult[] = rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name ?? 'Kinwin user',
    connectionStatus: row.connection_status as KinSearchConnectionStatus,
    connectionDirection: row.connection_direction as 'incoming' | 'outgoing' | null,
    connectionId: row.connection_id,
  }));
  return { ok: true, results };
}

/** Sends a Kin request directly to a known user id — the counterpart to redeemKinCode used by the search-based Add Kin flow. */
export async function sendKinRequest(userId: string): Promise<RedeemKinCodeResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.rpc('send_kin_request', { p_user_id: userId });
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
  /** Null only for legacy rows predating this column; used to dedupe against get_kin_current_challenges (see fetchKinCurrentChallenges). */
  readonly challengeId: string | null;
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
  readonly comments: readonly ActivityComment[];
};

export type ActivityComment = {
  readonly id: string;
  readonly activityId: string;
  readonly authorId: string;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly createdAt: string;
};

export type FetchActivityResult =
  | { readonly ok: true; readonly items: readonly ActivityItem[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * The Kin activity feed: real Kin activity only, never the caller's own —
 * every consumer of this feed (Home's "From your Kin" module, the Kin tab's
 * Activity list) is specifically about what a Kin did, not a combined
 * "me + Kin" timeline. RLS's own select policy (20260815000000) is
 * necessarily broader (own activity plus accepted Kin's, since a user must
 * also be able to see their own social_activity rows through other paths,
 * e.g. reactions on their own activity) — the `.neq('owner_id', userId)`
 * below is this feed's own, additional application-layer scoping on top of
 * that RLS floor, not a relaxation of it. Newest first, capped at a small,
 * restrained window — this is meant to feel like a short list of recent
 * moments, never an endless feed. Reactions are fetched separately (same
 * RLS shape) and folded in client-side into per-activity counts plus "did I
 * react" (which can legitimately be the caller reacting to a Kin's item).
 */
export async function fetchKinActivity(userId: string, limit = 30): Promise<FetchActivityResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: rows, error } = await supabase
    .from('social_activity')
    .select('id, owner_id, challenge_id, kind, payload, created_at')
    .neq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, ...classifyError(error) };
  if (!rows || rows.length === 0) return { ok: true, items: [] };

  const ownerIds = Array.from(new Set(rows.map((row) => row.owner_id)));
  const activityIds = rows.map((row) => row.id);
  const [profilesResult, reactionsResult, commentsResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', ownerIds),
    supabase.from('activity_reactions').select('activity_id, user_id, kind').in('activity_id', activityIds),
    supabase.from('activity_comments').select('id, activity_id, author_id, body, created_at').in('activity_id', activityIds).order('created_at', { ascending: true }),
  ]);
  if (profilesResult.error) return { ok: false, ...classifyError(profilesResult.error) };
  if (reactionsResult.error) return { ok: false, ...classifyError(reactionsResult.error) };
  if (commentsResult.error) return { ok: false, ...classifyError(commentsResult.error) };

  // Comment authors are frequently the caller themselves (replying to a
  // Kin's activity) as well as activity owners already covered by ownerIds
  // above — a second, deliberately separate id set rather than assuming
  // overlap, so a Kin who comments on another Kin's item (neither the
  // caller nor that item's owner) still resolves to a real name.
  const commentAuthorIds = Array.from(new Set((commentsResult.data ?? []).map((comment) => comment.author_id)));
  const unresolvedAuthorIds = commentAuthorIds.filter((id) => !ownerIds.includes(id));
  const authorProfilesResult = unresolvedAuthorIds.length > 0
    ? await supabase.from('profiles').select('id, display_name').in('id', unresolvedAuthorIds)
    : { data: [], error: null };
  if (authorProfilesResult.error) return { ok: false, ...classifyError(authorProfilesResult.error) };

  const nameById = new Map<string, string | null>();
  for (const profile of profilesResult.data ?? []) nameById.set(profile.id, profile.display_name as string | null);
  for (const profile of authorProfilesResult.data ?? []) nameById.set(profile.id, profile.display_name as string | null);

  const reactionsByActivity = new Map<string, { activity_id: string; user_id: string; kind: string }[]>();
  for (const reaction of reactionsResult.data ?? []) {
    const existing = reactionsByActivity.get(reaction.activity_id) ?? [];
    existing.push(reaction);
    reactionsByActivity.set(reaction.activity_id, existing);
  }
  const commentsByActivity = new Map<string, ActivityComment[]>();
  for (const comment of commentsResult.data ?? []) {
    const existing = commentsByActivity.get(comment.activity_id) ?? [];
    existing.push({
      id: comment.id,
      activityId: comment.activity_id,
      authorId: comment.author_id,
      authorDisplayName: nameById.get(comment.author_id) ?? 'Your Kin',
      body: comment.body,
      createdAt: comment.created_at,
    });
    commentsByActivity.set(comment.activity_id, existing);
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
      challengeId: row.challenge_id,
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
      comments: commentsByActivity.get(row.id) ?? [],
    };
  });
  return { ok: true, items };
}

export type KinCurrentChallenge = {
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly challengeId: string;
  readonly behavior: ActivityBehaviorPayload;
  readonly duration: ActivityDurationPayload | null;
  readonly startsAt: string;
  readonly plannedEndsAt: string;
};

export type FetchKinCurrentChallengesResult =
  | { readonly ok: true; readonly challenges: readonly KinCurrentChallenge[] }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * CURRENT Kin state — "what is my Kin doing right now" — never a social
 * event. Answers the physical-test bug where a newly accepted Kin's
 * partner already had an active challenge and no `challenge_started`
 * event existed for it (that event only fires at the moment of
 * activation — see get_kin_current_challenges' own migration comment for
 * the full architecture rationale). Callers should dedupe against
 * fetchKinActivity's results by challengeId before rendering both, so an
 * already-surfaced event isn't redundantly repeated as "current" too.
 */
export async function fetchKinCurrentChallenges(userId: string): Promise<FetchKinCurrentChallengesResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!userId) return { ok: false, kind: 'not_authenticated' };

  const { data: rows, error } = await supabase.rpc('get_kin_current_challenges');
  if (error) return { ok: false, ...classifyError(error) };
  if (!rows || rows.length === 0) return { ok: true, challenges: [] };

  const typedRows = rows as readonly {
    owner_id: string;
    challenge_id: string;
    behavior: ActivityBehaviorPayload;
    duration: ActivityDurationPayload | null;
    starts_at: string;
    planned_ends_at: string;
  }[];
  const ownerIds = Array.from(new Set(typedRows.map((row) => row.owner_id)));
  const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id, display_name').in('id', ownerIds);
  if (profileError) return { ok: false, ...classifyError(profileError) };

  const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.display_name as string | null]));
  const challenges: readonly KinCurrentChallenge[] = typedRows.map((row) => ({
    ownerId: row.owner_id,
    ownerDisplayName: nameById.get(row.owner_id) ?? 'Your Kin',
    challengeId: row.challenge_id,
    behavior: row.behavior,
    duration: row.duration,
    startsAt: row.starts_at,
    plannedEndsAt: row.planned_ends_at,
  }));
  return { ok: true, challenges };
}

// Standard Unicode emoji, not a branded semantic vocabulary — see
// 20260907000000_activity_comments_and_emoji_reactions.sql's own comment for
// why the old word-based set (respect/nice/worth_it/ouch/brutal) was
// replaced rather than relabeled: it read as Kinwin prescribing how a
// friend is allowed to respond, not real friends interacting.
export const REACTION_KINDS = ['🔥', '❤️', '😂', '😬', '👑'] as const;
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

export const REPORT_REASONS = ['harassment', 'hate_or_abuse', 'sexual_content', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type SubmitReportResult =
  | { readonly ok: true; readonly status: 'submitted' | 'already_reported' }
  | { readonly ok: false; readonly kind: 'not_configured' | 'rejected'; readonly message?: string }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Reports another person's visible social activity, or (when activityId is
 * omitted) the person themselves — always through the trusted
 * submit_social_report RPC (supabase/migrations/20260902000000_social_reports_and_content_filter.sql),
 * never a direct table write. The server independently re-checks that the
 * caller can actually see the target activity/person; this function never
 * asserts that on the client's own say-so. Reporting the same target again
 * is safe and idempotent — the server returns 'already_reported' rather
 * than creating a duplicate.
 */
export async function submitSocialReport(
  reportedUserId: string,
  reason: ReportReason,
  activityId: string | null = null,
  commentId: string | null = null,
): Promise<SubmitReportResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { data, error } = await supabase.rpc('submit_social_report', {
    p_reported_user_id: reportedUserId,
    p_reported_activity_id: activityId,
    p_reason: reason,
    p_reported_comment_id: commentId,
  });
  if (error) return { ok: false, kind: 'rejected', message: error.message };

  const result = data as { status?: string } | null;
  if (result?.status === 'submitted' || result?.status === 'already_reported') {
    return { ok: true, status: result.status };
  }
  return { ok: false, kind: 'unknown', message: 'The server did not confirm the report.' };
}

export type AddCommentResult =
  | { readonly ok: true; readonly comment: ActivityComment }
  | { readonly ok: false; readonly kind: 'not_configured' | 'not_authenticated' | 'empty' | 'too_long' }
  | { readonly ok: false; readonly kind: 'rejected'; readonly message: string }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Posts a flat (no threading) comment on a Kin's activity item — the actual
 * carrier of friendship-specific tone the fixed emoji reactions above
 * cannot express. Trimmed and length-checked here as a fast client-side
 * rejection; the real, authoritative boundary is server-side (the 200-char
 * table check constraint and the content-filter trigger — see
 * 20260907000000_activity_comments_and_emoji_reactions.sql), so a client
 * bypass can never post something the server wouldn't have accepted anyway.
 * authorId is always the caller's own id — RLS independently enforces this
 * regardless of what's passed here, so this can never forge another
 * person's authorship even if a caller were modified to try.
 */
export async function addActivityComment(authorId: string, activityId: string, body: string): Promise<AddCommentResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };
  if (!authorId) return { ok: false, kind: 'not_authenticated' };
  const validation = validateCommentBody(body);
  if (!validation.ok) return { ok: false, kind: validation.kind };

  const { data, error } = await supabase
    .from('activity_comments')
    .insert({ activity_id: activityId, author_id: authorId, body: validation.trimmed })
    .select('id, activity_id, author_id, body, created_at')
    .single();
  if (error) return { ok: false, kind: 'rejected', message: error.message };

  return {
    ok: true,
    comment: {
      id: data.id,
      activityId: data.activity_id,
      authorId: data.author_id,
      authorDisplayName: 'You',
      body: data.body,
      createdAt: data.created_at,
    },
  };
}

export type DeleteCommentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'not_configured' }
  | { readonly ok: false; readonly kind: 'network' | 'unknown'; readonly message: string };

/**
 * Deletes a comment — permitted by RLS for either the comment's own author
 * or the owner of the activity item it was posted on (removing an unwanted
 * comment from their own moment without needing to block/report the
 * commenter). Which of those two the caller actually is doesn't need to be
 * passed here: the delete simply affects zero rows if RLS denies it, same
 * pattern as clearMyReaction above.
 */
export async function deleteActivityComment(commentId: string): Promise<DeleteCommentResult> {
  if (!supabase) return { ok: false, kind: 'not_configured' };

  const { error } = await supabase.from('activity_comments').delete().eq('id', commentId);
  if (error) return { ok: false, kind: 'unknown', message: error.message };
  return { ok: true };
}
