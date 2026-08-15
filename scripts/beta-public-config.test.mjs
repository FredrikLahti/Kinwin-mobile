import assert from 'node:assert/strict';
import test from 'node:test';
import config from './beta-public-config.cjs';

const valid={EXPO_PUBLIC_SUPABASE_URL:config.EXPECTED_SUPABASE_URL,EXPO_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_test_value',EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_value',EXPO_PUBLIC_SUPPORT_EMAIL:'support@kinwin.app',EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL:'https://beta.kinwin.example'};
test('beta public config accepts only the hosted TEST contract',()=>assert.deepEqual(config.validateBetaPublicConfig(valid),{invitationHost:'beta.kinwin.example'}));
test('beta public config rejects wrong Supabase, live Stripe, missing/invalid support email, invalid invitation origins, and server secrets',()=>{
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_SUPABASE_URL:'https://other.supabase.co'}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_live_value'}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_SUPPORT_EMAIL:undefined}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_SUPPORT_EMAIL:'not-an-email'}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL:'http://beta.kinwin.example'}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,EXPO_PUBLIC_RECIPIENT_INVITATION_BASE_URL:'https://beta.kinwin.example/invite/secret'}));
  assert.throws(()=>config.validateBetaPublicConfig({...valid,TREMENDOUS_API_KEY:'TEST_secret'}));
});
test('static Expo and EAS config contain no invitation token or server secret value',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../app.config.js',import.meta.url),'utf8')+await readFile(new URL('../eas.json',import.meta.url),'utf8');
  assert.equal(source.includes('/invite/'),false);for(const name of config.FORBIDDEN_CLIENT_NAMES)assert.equal(source.includes(`${name}=`),false);
});
test('native-facing source does not reference server secrets or persist reward links',async()=>{
  const {readdir,readFile}=await import('node:fs/promises');const {join}=await import('node:path');const {fileURLToPath}=await import('node:url');
  const collect=async(dir)=>{const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(async e=>e.isDirectory()?collect(join(dir,e.name)):[join(dir,e.name)]))).flat();};
  const files=[...(await collect(fileURLToPath(new URL('../app',import.meta.url)))),...(await collect(fileURLToPath(new URL('../lib',import.meta.url))))].filter(f=>/\.[jt]sx?$/.test(f));
  const source=(await Promise.all(files.map(f=>readFile(f,'utf8')))).join('\n');
  for(const name of config.FORBIDDEN_CLIENT_NAMES)assert.equal(source.includes(name),false,`${name} referenced by native source`);
  const invite=await readFile(new URL('../app/invite/[token].tsx',import.meta.url),'utf8');
  assert.equal(/AsyncStorage|localStorage|redemption_url/.test(invite),false);
  assert.match(invite,/onPress=\{onOpenReward\}/);
});
