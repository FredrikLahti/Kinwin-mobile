import { supabase } from './client';

export const PLAYBOOK_CATEGORIES = ['trigger','obstacle','replacement','environment','support','lesson'] as const;
export type PlaybookCategory = typeof PLAYBOOK_CATEGORIES[number];
export type PlaybookEntry = { readonly id:string; readonly ownerId:string; readonly category:PlaybookCategory; readonly content:string; readonly sourceChallengeId:string|null; readonly createdAt:string; readonly updatedAt:string };
export type PlaybookResult<T> = {readonly ok:true;readonly value:T}|{readonly ok:false;readonly message:string};

type Row={id:string;owner_id:string;category:PlaybookCategory;content:string;source_challenge_id:string|null;created_at:string;updated_at:string};
const fromRow=(row:Row):PlaybookEntry=>({id:row.id,ownerId:row.owner_id,category:row.category,content:row.content,sourceChallengeId:row.source_challenge_id,createdAt:row.created_at,updatedAt:row.updated_at});
const unavailable=<T>():PlaybookResult<T>=>({ok:false,message:'Your Playbook is unavailable in this build.'});
const failed=<T>():PlaybookResult<T>=>({ok:false,message:'Could not update your Playbook. Check your connection and try again.'});

export async function fetchPlaybookEntries():Promise<PlaybookResult<readonly PlaybookEntry[]>>{
 if(!supabase)return unavailable();
 const {data,error}=await supabase.from('playbook_entries').select('id, owner_id, category, content, source_challenge_id, created_at, updated_at').is('archived_at',null).order('updated_at',{ascending:false});
 return error?failed():{ok:true,value:((data??[]) as Row[]).map(fromRow)};
}
export async function fetchArchivedPlaybookEntries():Promise<PlaybookResult<readonly PlaybookEntry[]>>{
 if(!supabase)return unavailable();
 const {data,error}=await supabase.from('playbook_entries').select('id, owner_id, category, content, source_challenge_id, created_at, updated_at').not('archived_at','is',null).order('updated_at',{ascending:false});
 return error?failed():{ok:true,value:((data??[]) as Row[]).map(fromRow)};
}
export async function unarchivePlaybookEntry(id:string):Promise<PlaybookResult<null>>{
 if(!supabase)return unavailable(); const {error}=await supabase.from('playbook_entries').update({archived_at:null}).eq('id',id); return error?failed():{ok:true,value:null};
}
export async function fetchPlaybookEntry(id:string):Promise<PlaybookResult<PlaybookEntry|null>>{
 if(!supabase)return unavailable();
 const {data,error}=await supabase.from('playbook_entries').select('id, owner_id, category, content, source_challenge_id, created_at, updated_at').eq('id',id).is('archived_at',null).maybeSingle();
 return error?failed():{ok:true,value:data?fromRow(data as Row):null};
}
export async function createPlaybookEntry(input:{ownerId:string;category:PlaybookCategory;content:string;sourceChallengeId?:string|null}):Promise<PlaybookResult<PlaybookEntry>>{
 if(!supabase)return unavailable(); const content=input.content.trim();
 const {data,error}=await supabase.from('playbook_entries').insert({owner_id:input.ownerId,category:input.category,content,source_challenge_id:input.sourceChallengeId??null}).select('id, owner_id, category, content, source_challenge_id, created_at, updated_at').single();
 return error||!data?failed():{ok:true,value:fromRow(data as Row)};
}
export async function updatePlaybookEntry(id:string,input:{category:PlaybookCategory;content:string}):Promise<PlaybookResult<PlaybookEntry>>{
 if(!supabase)return unavailable();
 const {data,error}=await supabase.from('playbook_entries').update({category:input.category,content:input.content.trim()}).eq('id',id).select('id, owner_id, category, content, source_challenge_id, created_at, updated_at').single();
 return error||!data?failed():{ok:true,value:fromRow(data as Row)};
}
export async function archivePlaybookEntry(id:string):Promise<PlaybookResult<null>>{
 if(!supabase)return unavailable(); const {error}=await supabase.from('playbook_entries').update({archived_at:new Date().toISOString()}).eq('id',id); return error?failed():{ok:true,value:null};
}
export async function deletePlaybookEntry(id:string):Promise<PlaybookResult<null>>{
 if(!supabase)return unavailable(); const {error}=await supabase.from('playbook_entries').delete().eq('id',id); return error?failed():{ok:true,value:null};
}

export async function fetchChallengeHistorySummary(ownerId:string):Promise<PlaybookResult<{completed:number;failed:number}>>{
 if(!supabase)return unavailable();
 const {data,error}=await supabase.from('challenges').select('challenge_status').eq('owner_id',ownerId).in('challenge_status',['completed_success','completed_failure']);
 if(error)return failed(); const rows=(data??[]) as {challenge_status:string}[];
 return {ok:true,value:{completed:rows.length,failed:rows.filter(row=>row.challenge_status==='completed_failure').length}};
}
