import { withSupabase } from 'npm:@supabase/server@^1';
import { createRecipientToken, hashRecipientToken } from '../_shared/recipient-invitation/token.ts';

export default { fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
  const ownerId = ctx.userClaims?.id;
  if (!ownerId) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId : '';
  if (!recipientId) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const { data: recipient } = await ctx.supabaseAdmin.from('challenge_recipients').select('id, challenge_id, challenges!inner(owner_id)').eq('id', recipientId).eq('challenges.owner_id', ownerId).maybeSingle();
  if (!recipient) return Response.json({ error: 'not_found' }, { status: 404 });
  const token = createRecipientToken();
  const tokenHash = await hashRecipientToken(token);
  const now = new Date().toISOString();
  const { data: existing } = await ctx.supabaseAdmin.from('invitations').select('id, invitation_status').eq('recipient_id', recipientId).eq('owner_id', ownerId).maybeSingle();
  const write = existing
    ? ctx.supabaseAdmin.from('invitations').update({ token_hash: tokenHash, token_issued_at: now, ...(existing.invitation_status === 'draft' ? { invitation_status: 'ready' } : {}) }).eq('id', existing.id).eq('owner_id', ownerId)
    : ctx.supabaseAdmin.from('invitations').insert({ challenge_id: recipient.challenge_id, owner_id: ownerId, recipient_id: recipientId, invitation_status: 'ready', token_hash: tokenHash, token_issued_at: now });
  const { data, error } = await write.select('id, invitation_status').single();
  if (error) { console.error('create-recipient-invitation failed'); return Response.json({ error: 'internal_error' }, { status: 500 }); }
  return Response.json({ invitationId: data.id, status: data.invitation_status, token });
}) };
