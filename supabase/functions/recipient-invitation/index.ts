import { withSupabase } from 'npm:@supabase/server@^1';
import { hashRecipientToken, isRecipientTokenShape } from '../_shared/recipient-invitation/token.ts';
import { RecipientInvitationProjection } from '../_shared/recipient-invitation/types.ts';

export default { fetch: withSupabase<any>({ auth: 'none' }, async (req, ctx) => {
  const body = await req.json().catch(() => ({})); const token = body.token;
  if (!isRecipientTokenShape(token)) return Response.json({ error: 'not_found' }, { status: 404 });
  const tokenHash = await hashRecipientToken(token);
  const { data: invitation } = await ctx.supabaseAdmin.from('invitations').select('id, invitation_status, recipient_id, organizer_id, challenge_id, challenge_recipients(display_name), challenge_reward_organizers(display_name), challenges!inner(owner_id, activation_snapshot, source_draft_id)').eq('token_hash', tokenHash).maybeSingle();
  if (!invitation) return Response.json({ error: 'not_found' }, { status: 404 });
  const action = body.action;
  if (action === 'accept' || action === 'decline') {
    const target = action === 'accept' ? 'accepted' : 'declined';
    if (invitation.invitation_status !== target) {
      if (!['ready', 'sent'].includes(invitation.invitation_status)) return Response.json({ error: 'invalid_transition' }, { status: 409 });
      const now = new Date().toISOString();
      const { data: changed, error } = await ctx.supabaseAdmin.from('invitations').update({ invitation_status: target, responded_at: now, sent_at: invitation.invitation_status === 'ready' ? now : undefined }).eq('id', invitation.id).eq('token_hash', tokenHash).in('invitation_status', ['ready', 'sent']).select('id').maybeSingle();
      if (error) return Response.json({ error: 'internal_error' }, { status: 500 });
      if (!changed) {
        const { data: latest } = await ctx.supabaseAdmin.from('invitations').select('invitation_status').eq('id', invitation.id).eq('token_hash', tokenHash).single();
        if (latest?.invitation_status !== target) return Response.json({ error: 'invalid_transition' }, { status: 409 });
      }
      invitation.invitation_status = target;
    }
  } else if (action !== undefined && action !== 'resolve') return Response.json({ error: 'invalid_action' }, { status: 400 });
  const challenge = invitation.challenges as any; const snapshot = challenge.activation_snapshot ?? {};
  let source = snapshot;
  if (!snapshot.goal && challenge.source_draft_id) { const { data } = await ctx.supabaseAdmin.from('challenge_drafts').select('draft_payload').eq('id', challenge.source_draft_id).single(); source = data?.draft_payload ?? {}; }
  const { data: profile } = await ctx.supabaseAdmin.from('profiles').select('display_name').eq('id', challenge.owner_id).maybeSingle();
  const {data:canonical}=await ctx.supabaseAdmin.from('challenge_reward_organizers').select('display_name, challenge_recipient_id').eq('challenge_id',invitation.challenge_id).single();
  const isOrganizer=invitation.organizer_id!==null||canonical?.challenge_recipient_id===invitation.recipient_id;
  const {data:recipientRows}=isOrganizer?await ctx.supabaseAdmin.from('challenge_recipients').select('display_name').eq('challenge_id',invitation.challenge_id).order('sort_order'):({data:[]} as any);
  const handoff=isOrganizer&&invitation.invitation_status==='accepted'?(await ctx.supabaseAdmin.rpc('get_accepted_organizer_reward_handoff',{p_invitation_id:invitation.id})).data:null;
  const projection: RecipientInvitationProjection = { status: invitation.invitation_status, ownerName: profile?.display_name?.trim() || 'Someone close to you', recipientName: invitation.recipient_id ? (invitation.challenge_recipients as any)?.display_name ?? null : null, goal: source.goal || '', behavior: source.behavior?.description || '', consequenceCategory: source.consequenceCategory || source.experienceCategory || '', ownerSitsOut: true, accessRole:isOrganizer?'organizer':'recipient',organizerName:canonical?.display_name??(invitation.challenge_reward_organizers as any)?.display_name??null,recipientNames:(recipientRows??[]).map((row:any)=>row.display_name),rewardStatus:handoff?.status??null };
  return Response.json({ invitation: projection });
}) };
