import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../main.js',import.meta.url),'utf8');
async function page(session,active,error=null,legacyRole='viewer') {
  const listeners={};let gtmRequests=0;
  const classList={toggle(){},add(){},contains(){return false}};
  const ad={hidden:false};const checkout={hidden:true,addEventListener(){}};const panel={hidden:false};
  const storage={getItem(){return 'rejected'},setItem(){},removeItem(){}};
  const document={
    head:{appendChild(){gtmRequests++}},
    body:{classList},documentElement:{classList,getAttribute(){return 'light'},setAttribute(){}},
    getElementById(){return null},querySelector(){return null},
    querySelectorAll(selector){return selector==='.ad-container, .adsbygoogle'?[ad]:selector==='.js-pro-checkout'?[checkout]:selector==='.pro-container'?[panel]:[]},
    addEventListener(event,callback){listeners[event]=callback}
  };
  const window={localStorage:storage,matchMedia(){return {matches:true}},addEventListener(){},
    MiPortalSupabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:legacyRole},error:null})})})}),auth:{getSession:async()=>({data:{session}}),onAuthStateChange(){}},rpc:async()=>({data:active,error})}};
  runInNewContext(source,{document,window,localStorage:storage,console,URL,setTimeout,clearTimeout});
  listeners.DOMContentLoaded();
  await new Promise(resolve=>setImmediate(resolve));
  return {ad,checkout,panel,gtmRequests};
}
test('active Pro hides ads; free accounts show ads; unavailable entitlement does not offer a duplicate purchase',async()=>{
  const session={user:{id:'fixture'}};
  let state=await page(session,true);assert.equal(state.ad.hidden,true);assert.equal(state.checkout.hidden,true);
  state=await page(session,false);assert.equal(state.ad.hidden,false);assert.equal(state.checkout.hidden,false);
  state=await page(session,null,{message:'unavailable'});assert.equal(state.checkout.hidden,true);
  state=await page(null,false);assert.equal(state.checkout.hidden,true);assert.equal(state.ad.hidden,false);
  assert.equal(state.gtmRequests,0,'rejecting cookies must not load GTM on reload');
});

test('legacy database Pro grants remain active with missing or inactive subscription RPC',async()=>{
  const session={user:{id:'fixture',user_metadata:{role:'pro'}}};
  for(const [active,error] of [[null,{code:'PGRST202'}],[false,null]]) {
    const state=await page(session,active,error,'pro');
    assert.equal(state.ad.hidden,true);
    assert.equal(state.checkout.hidden,true);
  }
  const forged=await page(session,false,null,'viewer');
  assert.equal(forged.ad.hidden,false,'user metadata cannot grant Pro');
});
