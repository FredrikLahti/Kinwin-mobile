export const COMMENT_MAX_LENGTH = 200;

export type CommentValidationResult =
  | { readonly ok: true; readonly trimmed: string }
  | { readonly ok: false; readonly kind: 'empty' | 'too_long' };

/**
 * Pure trim/length pre-check shared by the client's fast-reject path
 * (lib/supabase/kin-repository.ts's addActivityComment) and this file's own
 * test. The real, authoritative boundary is server-side — the 200-char
 * table check constraint and the content-filter trigger in
 * 20260907000000_activity_comments_and_emoji_reactions.sql — so this exists
 * only to give the user immediate feedback, never as the actual guarantee.
 */
export function validateCommentBody(raw: string): CommentValidationResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, kind: 'empty' };
  if (trimmed.length > COMMENT_MAX_LENGTH) return { ok: false, kind: 'too_long' };
  return { ok: true, trimmed };
}
