const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const preference = require('../api/mp-preference');
const webhook = require('../api/webhook-mercadopago');
const uid = '11111111-2222-4333-8444-555555555555';
const other = '22222222-2222-4333-8444-555555555555';
const key = '44444444-2222-4333-8444-555555555555';
const config = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'mock-db-secret',
  MERCADOPAGO_ACCESS_TOKEN:'TEST-mock', MERCADOPAGO_MODE:'test', VERCEL:'1',
  MERCADOPAGO_WEBHOOK_SECRET:'test-secret-not-used-outside-tests' };
const response = (status,body) => ({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body)});
function setup(t) { const saved={...process.env}; Object.assign(process.env,config); t.after(()=>{process.env=saved}); }
async function run(handler,req) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(b){this.body=b;return this},send(b){this.body=b;return this}};
  await handler(req,res); return res;
}
const checkout = (body={}) => ({method:'POST',headers:{origin:'https://www.miportal.me','content-type':'application/json',authorization:'Bearer verified-test-token','idempotency-key':key},body});
function notice(id='123',overrides={}) {
  const ts=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',config.MERCADOPAGO_WEBHOOK_SECRET).update(`id:${id};request-id:req;ts:${ts};`).digest('hex');
  return {method:'POST',url:`/api/webhook-mercadopago?data.id=${id}`,headers:{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':'req'},body:{type:'payment',data:{id}},...overrides};
}
const payment = (overrides={}) => ({id:123,status:'approved',transaction_amount:19999,currency_id:'COP',external_reference:uid,live_mode:false,
  date_approved:'2026-10-01T12:00:00Z',date_last_updated:'2026-10-01T12:01:00Z',...overrides});
test('checkout uses verified identity, server price and stable per-user idempotency',async t=>{
  setup(t); const sent=[];
  t.mock.method(global,'fetch',async(url,options)=>{
    if(url.endsWith('/auth/v1/user')) return response(200,{id:uid});
    if(url.endsWith('/has_active_pro')) return response(200,false);
    sent.push(options); return response(200,{init_point:'https://www.mercadopago.com.co/checkout/v1/redirect?pref-id=test'});
  });
  assert.equal((await run(preference,checkout())).code,200);
  assert.equal((await run(preference,checkout())).code,200);
  assert.equal(JSON.parse(sent[0].body).external_reference,uid);
  assert.equal(JSON.parse(sent[0].body).items[0].unit_price,19999);
  assert.equal(sent[0].headers['X-Idempotency-Key'],sent[1].headers['X-Idempotency-Key']);
});
test('checkout rejects missing/expired sessions and cross-user spoofing before creating a payment',async t=>{
  setup(t); let calls=0;
  t.mock.method(global,'fetch',async url=>{calls++;assert.match(url,/auth\/v1\/user$/);return response(200,{id:uid})});
  const missing=checkout(); delete missing.headers.authorization;
  assert.equal((await run(preference,missing)).code,401); assert.equal(calls,0);
  assert.equal((await run(preference,checkout({user_id:other}))).code,403);
  t.mock.method(global,'fetch',async()=>response(401,{}));
  assert.equal((await run(preference,checkout())).code,401);
});
test('checkout rejects hostile origin, bad body and missing idempotency key',async t=>{
  setup(t); let paid=false;
  t.mock.method(global,'fetch',async url=>{ if(!url.endsWith('/auth/v1/user'))paid=true; return response(200,{id:uid}) });
  const req=checkout(); req.headers.origin='https://evil.example';
  assert.equal((await run(preference,req)).code,403);
  assert.equal((await run(preference,checkout({price:1}))).code,400);
  const noKey=checkout();delete noKey.headers['idempotency-key'];
  assert.equal((await run(preference,noKey)).code,400);assert.equal(paid,false);
});
test('checkout cannot accept payment when the entitlement migration/service is unavailable',async t=>{
  setup(t);t.mock.method(global,'fetch',async url=>{
    if(url.endsWith('/auth/v1/user'))return response(200,{id:uid});
    assert.match(url,/has_active_pro$/);return response(404,{});
  });
  assert.equal((await run(preference,checkout())).code,503);
});
test('webhook accepts documented comma-separated signature and rechecks authoritative payment',async t=>{
  setup(t);let events=[];
  t.mock.method(global,'fetch',async(url,options)=>{
    if(url.includes('/v1/payments/'))return response(200,payment());
    assert.match(url,/record_pro_payment_event$/);events.push(JSON.parse(options.body));return response(200,{payment_registered:true});
  });
  assert.equal((await run(webhook,notice())).code,200);
  assert.equal(events[0].p_user_id,uid);assert.equal(events[0].p_status,'approved');
});
test('webhook rejects wrong, malformed, duplicate or absent signature without network',async t=>{
  setup(t);t.mock.method(global,'fetch',async()=>{throw Error('must not fetch')});
  for(const signature of ['', 'ts=1700000000;v1=deadbeef','ts=1700000000,v1=deadbeef', 'ts=1700000000,ts=1700000000,v1='+'a'.repeat(64)]) {
    const req=notice();req.headers['x-signature']=signature;assert.equal((await run(webhook,req)).code,401);
  }
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  assert.equal((await run(webhook,notice())).code,500);
});
test('webhook binds signed query id to body and rejects test/live mismatch',async t=>{
  setup(t);const mismatch=notice(); mismatch.body.data.id='999';
  t.mock.method(global,'fetch',async()=>response(200,payment({live_mode:true})));
  assert.equal((await run(webhook,mismatch)).code,400);
  assert.equal((await run(webhook,notice())).code,422);
});
test('wrong price/currency and rejected payments never grant entitlement',async t=>{
  setup(t);for(const payload of [payment({transaction_amount:1}),payment({currency_id:'USD'}),payment({status:'rejected'}),payment({external_reference:'bad'})]) {
    t.mock.method(global,'fetch',async url=>{assert.match(url,/\/v1\/payments\//);return response(200,payload)});
    assert.equal((await run(webhook,notice())).code,200);
  }
});
test('refund/chargeback and partial refund revoke entitlement through the ledger',async t=>{
  setup(t);for(const payload of [payment({status:'refunded'}),payment({status:'charged_back'}),payment({transaction_amount_refunded:100})]) {
    let event;
    t.mock.method(global,'fetch',async(url,options)=>{
      if(url.includes('/v1/payments/'))return response(200,payload);
      event=JSON.parse(options.body);return response(200,{});
    });
    assert.equal((await run(webhook,notice())).code,200);assert.equal(event.p_status,'revoked');
  }
});
