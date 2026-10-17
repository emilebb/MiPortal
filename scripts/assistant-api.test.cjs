const test=require('node:test'); const assert=require('node:assert/strict');
const handler=require('../api/assistant');
const uid='11111111-2222-4333-8444-555555555555';
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
function setup(t){const saved={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test-key',N8N_ASSISTANT_WEBHOOK_SECRET:'test-secret-at-least-thirty-two-characters',VERCEL:'1'});t.after(()=>{process.env=saved})}
async function run(body={message:'Hola',sessionId:'guest'},headers={}){
  const res={headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}};
  await handler({method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'192.0.2.10',...headers},body},res);return res;
}
test('invalid input never reserves a quota or calls n8n',async t=>{
  setup(t);t.mock.method(global,'fetch',async()=>{throw Error('must not fetch')});
  for(const body of [null,[],{}, {message:1},{message:''},{message:'x'.repeat(1001)}]) assert.equal((await run(body)).statusCode,400);
});
test('authenticated quota derives identity from Auth, not session or supplied role',async t=>{
  setup(t);let quota;
  t.mock.method(global,'fetch',async(url,options)=>{
    if(url.endsWith('/auth/v1/user'))return response(200,{id:uid,user_metadata:{role:'admin'}});
    if(url.endsWith('/reserve_assistant_request')){quota=JSON.parse(options.body);return response(200,{allowed:true})}
    assert.equal(options.headers['X-MiPortal-Assistant-Secret'],process.env.N8N_ASSISTANT_WEBHOOK_SECRET);
    return response(200,{reply:'OK',links:[]});
  });
  assert.equal((await run({message:'Hola',sessionId:'arbitrary',role:'pro'},{authorization:'Bearer valid'})).statusCode,200);
  assert.equal(quota.p_user_id,uid);assert.equal(quota.p_session_hash,null);assert.match(quota.p_ip_hash,/^[0-9a-f]{64}$/);
});
test('guests get a hashed ephemeral identity; persistent denial returns Retry-After without n8n',async t=>{
  setup(t);let calls=0;
  t.mock.method(global,'fetch',async(url,options)=>{
    calls++;assert.match(url,/reserve_assistant_request$/);
    const quota=JSON.parse(options.body);assert.equal(quota.p_user_id,null);assert.match(quota.p_session_hash,/^[0-9a-f]{64}$/);
    return response(200,{allowed:false,retry_after:3600});
  });
  const result=await run();assert.equal(result.statusCode,429);assert.equal(result.headers['Retry-After'],'3600');assert.equal(calls,1);
});
test('invalid token cannot downgrade into anonymous quota; Auth outage fails closed',async t=>{
  setup(t);t.mock.method(global,'fetch',async url=>{assert.match(url,/auth\/v1\/user$/);return response(401,{})});
  assert.equal((await run(undefined,{authorization:'Bearer invalid'})).statusCode,401);
  t.mock.method(global,'fetch',async()=>{throw Error('offline')});
  assert.equal((await run(undefined,{authorization:'Bearer valid'})).statusCode,503);
});
test('missing quota infrastructure or n8n credential and malformed quota responses fail closed',async t=>{
  setup(t);let calls=0;t.mock.method(global,'fetch',async()=>{calls++;return response(200,{})});
  assert.equal((await run()).statusCode,503);assert.equal(calls,1);
  delete process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  assert.equal((await run()).statusCode,503);assert.equal(calls,1);
});
test('page metadata is bounded and upstream transport failures return fallback',async t=>{
  setup(t);let sent;
  t.mock.method(global,'fetch',async(url,options)=>{
    if(url.endsWith('/reserve_assistant_request'))return response(200,{allowed:true});
    sent=JSON.parse(options.body);throw Error('n8n offline');
  });
  assert.equal((await run({message:' Hola ',sessionId:'guest',page:{path:'//evil.example',title:'x'.repeat(300)}})).statusCode,502);
  assert.equal(sent.message,'Hola');assert.deepEqual(sent.page,{title:'x'.repeat(120)});
});
