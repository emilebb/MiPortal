import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Script,runInNewContext} from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
test('audit server blocks writes and foreign report origins and serves reproducible scripts',async t=>{
 const child=spawn(process.execPath,['scripts/serve-audit.mjs'],{env:{...process.env,AUDIT_PORT:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 t.after(()=>child.kill());
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Audit server startup timeout')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}})});
 assert.equal((await fetch(origin+'/api/mp-preference',{method:'POST',body:'{}'})).status,503);
 assert.equal((await fetch(origin+'/__audit/result',{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(origin+'/__audit/result',{method:'POST',headers:{origin,'content-type':'application/json','X-Audit-Run':'old-run'},body:'{}'})).status,403);
 for(const script of ['fixture','worker','runner'])new Script(await (await fetch(origin+'/__audit/'+script+'.js')).text());
 const fixture=await (await fetch(origin+'/supabase-config.js')).text();
 let localCalls=0;const ctx={window:{fetch:async()=>{localCalls++;return new Response('local')}},location:{origin,href:origin+'/index.html',search:'?__theme=dark&__case=55'},localStorage:{setItem(){}},URL,URLSearchParams,Response};
 runInNewContext(fixture,ctx);runInNewContext(fixture,ctx);
 ctx.location.search='';
 runInNewContext(fixture,ctx);
 assert.equal(ctx.window.__miportalAuditCase,55,'recovery URL cleanup must not erase the test identity');
 await assert.rejects(ctx.window.fetch('https://production.invalid/api'),/blocks external fetch/);
 assert.equal((await ctx.window.fetch('https://fixture.invalid/auth/v1/token',{method:'POST'})).status,503);
 await ctx.window.fetch(origin+'/styles.css');assert.equal(localCalls,1);
});
test('audit engine and fixture scripts are excluded from the production build',()=>{
 assert.equal(existsSync(new URL('../public/__audit/',import.meta.url)),false);
 assert.equal(existsSync(new URL('../public/node_modules/',import.meta.url)),false);
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/__audit|axe\.min\.js|fixture\.invalid/);
});
