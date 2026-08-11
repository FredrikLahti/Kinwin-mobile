import { withSupabase } from 'npm:@supabase/server@^1';
export default { fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
  const ownerId = ctx.userClaims?.id; const body = await req.json().catch(() => ({}));
  if (!ownerId || typeof body.invitationId !== 'string') return Response.json({ error: 'invalid_request' }, { status: 400 });
  const { data: existing } = await ctx.supabaseAdmin.from('invitations').select('id, invitation_status, sent_at').eq('id', body.invitationId).eq('owner_id', ownerId).maybeSingle();
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 });
  const now = new Date().toISOString(); const status = existing.invitation_status === 'ready' ? 'sent' : existing.invitation_status;
  await ctx.supabaseAdmin.from('invitations').update({ invitation_status: status, sent_at: existing.sent_at ?? now, last_shared_at: now }).eq('id', existing.id).eq('owner_id', ownerId);
  return Response.json({ status });
}) };
