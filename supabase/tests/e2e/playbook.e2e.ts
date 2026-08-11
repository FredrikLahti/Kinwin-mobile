import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import test from'node:test';import{createClient}from'@supabase/supabase-js';
const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_ANON_KEY;if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
const client=()=>createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});const password='correct horse battery staple';
async function user(){const c=client();const email=`playbook-${randomUUID()}@kinwin-e2e.test`;await c.auth.signUp({email,password});const{data,error}=await c.auth.signInWithPassword({email,password});assert.equal(error,null);assert.ok(data.user);return{c,id:data.user!.id};}
test('real PostgREST Playbook CRUD, archive, validation and ownership',async()=>{const a=await user();const b=await user();
 const created=await a.c.from('playbook_entries').insert({owner_id:a.id,category:'obstacle',content:'Late meetings disrupt dinner.'}).select('id, content').single();assert.equal(created.error,null);assert.ok(created.data);const id=created.data!.id;
 const seen=await a.c.from('playbook_entries').select('id').eq('id',id);assert.equal(seen.data?.length,1);
 const hidden=await b.c.from('playbook_entries').select('id').eq('id',id);assert.equal(hidden.error,null);assert.equal(hidden.data?.length,0);
 const changed=await b.c.from('playbook_entries').update({content:'Tampered'}).eq('id',id).select('id');assert.equal(changed.error,null);assert.equal(changed.data?.length,0);
 const invalid=await a.c.from('playbook_entries').insert({owner_id:a.id,category:'mood',content:'Invalid'});assert.equal(invalid.error?.code,'23514');
 const updated=await a.c.from('playbook_entries').update({category:'replacement',content:'Prepare dinner before the meeting.'}).eq('id',id).select('category').single();assert.equal(updated.data?.category,'replacement');
 const archived=await a.c.from('playbook_entries').update({archived_at:new Date().toISOString()}).eq('id',id).select('archived_at').single();assert.ok(archived.data?.archived_at);
 const removed=await a.c.from('playbook_entries').delete().eq('id',id).select('id').single();assert.equal(removed.data?.id,id);
});
