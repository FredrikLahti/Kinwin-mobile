import { readSupabaseConfig } from './config'; import { supabase } from './client';
export type OwnerInvitationStatus = 'ready' | 'sent' | 'accepted' | 'declined';
export type OwnerInvitation = { readonly id: string; readonly recipientId: string; readonly status: OwnerInvitationStatus };
export type OwnerRewardOrganizer={readonly id:string;readonly kind:'recipient'|'other';readonly displayName:string;readonly recipientId:string|null;readonly invitationId:string|null;readonly status:OwnerInvitationStatus|null};
export type RecipientProjection = { readonly status: OwnerInvitationStatus; readonly ownerName: string; readonly recipientName: string|null; readonly goal: string; readonly behavior: string; readonly consequenceCategory: string; readonly ownerSitsOut: true; readonly accessRole:'recipient'|'organizer'; readonly organizerName:string|null; readonly recipientNames:readonly string[] };
type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
const failed = <T>(message = 'Could not load recipient invitations.'): Result<T> => ({ ok: false, message });

export async function fetchOwnerInvitations(challengeId: string): Promise<Result<readonly OwnerInvitation[]>> {
  if (!supabase) return failed('Recipient invitations are unavailable in this build.');
  const { data, error } = await supabase.from('invitations').select('id, recipient_id, invitation_status').eq('challenge_id', challengeId);
  return error ? failed() : { ok: true, value: (data ?? []).filter((row) => row.recipient_id && ['ready','sent','accepted','declined'].includes(row.invitation_status)).map((row) => ({ id: row.id, recipientId: row.recipient_id!, status: row.invitation_status as OwnerInvitationStatus })) };
}
export async function fetchOwnerRewardOrganizer(challengeId:string):Promise<Result<OwnerRewardOrganizer|null>>{if(!supabase)return failed('Reward organizer is unavailable in this build.');const{data,error}=await supabase.from('challenge_reward_organizers').select('id, organizer_kind, display_name, challenge_recipient_id').eq('challenge_id',challengeId).maybeSingle();if(error)return failed();if(!data)return{ok:true,value:null};const query=data.organizer_kind==='recipient'?supabase.from('invitations').select('id, invitation_status').eq('recipient_id',data.challenge_recipient_id):supabase.from('invitations').select('id, invitation_status').eq('organizer_id',data.id);const invitation=await query.maybeSingle();if(invitation.error)return failed();return{ok:true,value:{id:data.id,kind:data.organizer_kind,displayName:data.display_name,recipientId:data.challenge_recipient_id,invitationId:invitation.data?.id??null,status:(invitation.data?.invitation_status as OwnerInvitationStatus|undefined)??null}};}
export async function createRecipientInvitation(recipientId: string): Promise<Result<{ invitationId: string; status: OwnerInvitationStatus; token: string }>> {
  if (!supabase) return failed('Recipient invitations are unavailable in this build.');
  const { data, error } = await supabase.functions.invoke('create-recipient-invitation', { body: { recipientId } });
  return error || !data?.token ? failed('Could not prepare this invitation link.') : { ok: true, value: data };
}
export async function createOrganizerInvitation(organizerId:string):Promise<Result<{invitationId:string;status:OwnerInvitationStatus;token:string}>>{if(!supabase)return failed('Organizer invitations are unavailable in this build.');const{data,error}=await supabase.functions.invoke('create-organizer-invitation',{body:{organizerId}});return error||!data?.token?failed('Could not prepare this organizer invitation.'): {ok:true,value:data};}
export async function markRecipientInvitationShared(invitationId: string): Promise<void> { if (supabase) await supabase.functions.invoke('mark-recipient-invitation-shared', { body: { invitationId } }); }
export async function accessRecipientInvitation(token: string, action: 'resolve' | 'accept' | 'decline' = 'resolve'): Promise<Result<RecipientProjection>> {
  const config = readSupabaseConfig(); if (!config) return failed('This invitation is unavailable in this build.');
  const response = await fetch(`${config.url}/functions/v1/recipient-invitation`, { method: 'POST', headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action }) });
  if (!response.ok) return failed(response.status === 404 ? 'This invitation link is not valid.' : response.status === 409 ? 'This invitation already has a different response.' : 'Could not open this invitation.');
  const data = await response.json(); return data?.invitation ? { ok: true, value: data.invitation } : failed();
}
