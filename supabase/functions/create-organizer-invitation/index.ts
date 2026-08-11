import { withSupabase } from 'npm:@supabase/server@^1';
import { createRecipientToken, hashRecipientToken } from '../_shared/recipient-invitation/token.ts';

export default { fetch: withSupabase<any>({ auth: 'user' }, async (req, ctx) => {
  const ownerId=ctx.userClaims?.id; const body=await req.json().catch(()=>({}));
  if(!ownerId||typeof body.organizerId!=='string')return Response.json({error:'invalid_request'},{status:400});
  const {data:organizer}=await ctx.supabaseAdmin.from('challenge_reward_organizers').select('id, challenge_id, organizer_kind, challenge_recipient_id').eq('id',body.organizerId).eq('owner_id',ownerId).maybeSingle();
  if(!organizer)return Response.json({error:'not_found'},{status:404});
  if(organizer.organizer_kind==='recipient')return Response.json({error:'use_recipient_invitation',recipientId:organizer.challenge_recipient_id},{status:409});
  const token=createRecipientToken();const tokenHash=await hashRecipientToken(token);const now=new Date().toISOString();
  const {data:existing}=await ctx.supabaseAdmin.from('invitations').select('id, invitation_status').eq('organizer_id',organizer.id).eq('owner_id',ownerId).maybeSingle();
  const write=existing?ctx.supabaseAdmin.from('invitations').update({token_hash:tokenHash,token_issued_at:now,...(existing.invitation_status==='draft'?{invitation_status:'ready'}:{})}).eq('id',existing.id).eq('owner_id',ownerId):ctx.supabaseAdmin.from('invitations').insert({challenge_id:organizer.challenge_id,owner_id:ownerId,organizer_id:organizer.id,invitation_status:'ready',token_hash:tokenHash,token_issued_at:now});
  const {data,error}=await write.select('id, invitation_status').single();if(error)return Response.json({error:'internal_error'},{status:500});
  return Response.json({invitationId:data.id,status:data.invitation_status,token});
})};
