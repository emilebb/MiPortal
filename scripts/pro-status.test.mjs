import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../js/pro-status.js',import.meta.url),'utf8');
async function status(role,active,error=null){
 const node={textContent:''},button={addEventListener(){}}; let rpcCalls=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'fixture'}}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role}})})})}),rpc:async()=>{rpcCalls++;return{data:active,error}}};
 runInNewContext(source,{window:{MiPortalSupabase:client},document:{getElementById:id=>id==='proPaymentStatus'?node:button}});
 await new Promise(resolve=>setImmediate(resolve));return{text:node.textContent,disabled:button.disabled,rpcCalls};
}
test('Pro return page preserves legacy benefits without requiring subscription migration',async()=>{
 const state=await status('pro',null,{code:'PGRST202'});
 assert.match(state.text,/conserva sus beneficios Pro/);assert.equal(state.rpcCalls,0);assert.equal(state.disabled,false);
});
test('Pro return page never treats viewer role or failed RPC as proof of payment',async()=>{
 assert.match((await status('viewer',false)).text,/Todavía no consta/);
 assert.match((await status('viewer',null,{code:'PGRST202'})).text,/No pudimos comprobar/);
});
test('blocked browser storage does not prevent common script initialization or load analytics',()=>{
 const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');let ready=false;
 const window={get localStorage(){throw Error('Storage denied')}};
 assert.doesNotThrow(()=>runInNewContext(main,{window,document:{addEventListener(){ready=true}}}));
 assert.equal(ready,true);assert.equal(window.dataLayer.length,1);
});
