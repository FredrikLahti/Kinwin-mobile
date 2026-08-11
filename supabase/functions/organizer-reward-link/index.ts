import { withSupabase } from 'npm:@supabase/server@^1';
import { hashRecipientToken, isRecipientTokenShape } from '../_shared/recipient-invitation/token.ts';
import { createTremendousGenerateLinkAdapter, readTremendousSandboxConfig } from '../_shared/tremendous/adapter.ts';

export default { fetch: withSupabase<any>({ auth: 'none' }, async (req, ctx) => {
  if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const body = await req.json().catch(() => ({}));
  if (!isRecipientTokenShape(body.token)) return Response.json({ error: 'not_found' }, { status: 404 });
  const tokenHash = await hashRecipientToken(body.token);
  const { data: invitation } = await ctx.supabaseAdmin.from('invitations').select('id, invitation_status').eq('token_hash', tokenHash).maybeSingle();
  if (!invitation || invitation.invitation_status !== 'accepted') return Response.json({ error: 'not_found' }, { status: 404 });
  const { data: prepared } = await ctx.supabaseAdmin.rpc('prepare_accepted_organizer_reward_link', { p_invitation_id: invitation.id });
  const providerRewardId = prepared?.providerRewardId;
  if (typeof providerRewardId !== 'string') return Response.json({ error: 'not_found' }, { status: 404 });
  const config = readTremendousSandboxConfig((name) => Deno.env.get(name));
  if (!config) return Response.json({ error: 'sandbox_not_configured' }, { status: 503 });
  const result = await createTremendousGenerateLinkAdapter(config)(providerRewardId);
  if (!result.ok) return Response.json({ error: result.code }, { status: result.retryable ? 502 : 422 });
  return Response.json({ url: result.url });
}) };
