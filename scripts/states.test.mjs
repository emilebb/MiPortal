import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import test from 'node:test';
import {chromeSession} from './chrome-test-session.mjs';
const root=new URL('../public/',import.meta.url);
const mock=`
window.pending=[];window.violations=[];
addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective));
if(location.search.includes('timeout')) { const timeout=AbortSignal.timeout.bind(AbortSignal); AbortSignal.timeout=()=>timeout(50); }
if(!location.search.includes('missing'))window.MiPortalSupabase={from(table){let signal;return {
 select(){return this},eq(){return this},order(){return this},limit(){return this},abortSignal(value){signal=value;return this},
 then(resolve){const entry={table,resolve};pending.push(entry);if(signal){const abort=()=>{pending=pending.filter(x=>x!==entry);resolve({error:{message:'Controlled timeout'}})};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}}
}}};
addEventListener('DOMContentLoaded',()=>{window.testReady=true});
`;
const fixtures=[
 {id:'550e8400-e29b-41d4-a716-446655440001',published:true,title:'Guía de Angular para crear aplicaciones',description:'Desarrollo web en español',url:'https://example.test/angular',source:'Fuente de prueba',published_at:'2026-10-15T12:00:00Z'},
 {id:'550e8400-e29b-41d4-a716-446655440002',published:true,title:'CSS container queries for web developers',description:'<script>window.injected=true</script><p>Learn CSS</p>',url:'https://example.test/css',source:'Fixture English',published_at:'2026-10-16T12:00:00Z'}
];
test('resources and current Supabase news states with page CSP', {timeout:60000},async t=>{
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/mock.js'){res.setHeader('Content-Type','text/javascript');res.end(mock);return;}
  if(!['/recursos.html','/noticias.html','/main.js','/styles.css'].includes(path)&&!/^\/js\/[a-z0-9-]+\.(?:mjs|js)$/.test(path)){res.writeHead(404).end();return;}
  let body=await readFile(new URL(path.slice(1),root),'utf8');
  if(path.endsWith('.html'))body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script src="/mock.js"></script><script src="/main.js"></script>'+(path==='/noticias.html'?'<script type="module" src="/js/news-page.mjs"></script>':'')+'</body>');
  res.setHeader('Content-Type',/\.m?js$/.test(path)?'text/javascript':path.endsWith('.html')?'text/html':'text/css');res.end(body);
 }catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const {send,close}=await chromeSession();t.after(close);
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);await send('Network.setBlockedURLs',{urls:['https://*']},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value};
 const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,25))}assert.fail(expression)};
 const navigate=async page=>{await evaluate('window.testReady=false');await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/${page}`},sessionId);await wait('window.testReady===true')};
 const settle=async payload=>{await wait('pending.length===1');await evaluate(`pending.splice(0).forEach(x=>x.resolve(${JSON.stringify(payload)}))`)};
 for(const [page,grid,loading] of [['recursos.html','#resourcesGrid','.loading-spinner'],['noticias.html','#cardsContainer','.skeleton-card']]){
  await t.test(`${page}: loading, empty, error, retry and success`,async()=>{
   await navigate(page);await wait(`!!document.querySelector('${grid} ${loading}')`);
   await settle({data:[],error:null});await wait(`!!document.querySelector('${grid} .empty-state')`);
   await navigate(page);await settle({data:null,error:{message:'Controlled failure'}});await wait(`!!document.querySelector('${grid} .retry-button')`);
   assert.equal(await evaluate(`document.querySelector('${grid}').hasAttribute('aria-busy')`),false);
   await evaluate(`document.querySelector('${grid} .retry-button').click()`);
   await settle({data:page==='noticias.html'?fixtures:[{title:'Recurso de prueba',description:'Descripción',url:'https://example.test/resource'}],error:null});
   await wait(`document.querySelectorAll('${grid} .card').length===${page==='noticias.html'?2:1}`);
   assert.deepEqual(await evaluate(`violations.filter(v=>v.startsWith('script-src'))`),[]);
  });
 }
 await t.test('news filters, internal accessible links, safe text and failed refresh preserve data',async()=>{
  await navigate('noticias.html');await settle({data:fixtures,error:null});await wait("document.querySelectorAll('.news-card').length===2");
  assert.equal(await evaluate('window.injected===undefined'),true);
  assert.equal(await evaluate("document.querySelector('.news-card .card-title a').getAttribute('target')"),null);
  assert.equal(await evaluate("document.querySelector('.news-card .card-link').textContent.includes('pestaña nueva')"),false);
  await evaluate("document.getElementById('searchInput').value='angular';document.getElementById('searchForm').requestSubmit()");
  assert.equal(await evaluate("document.querySelectorAll('.news-card').length"),1);
  await evaluate("document.getElementById('resetNews').click()");
  assert.equal(await evaluate("document.querySelectorAll('.news-card').length"),2);
  await evaluate("document.getElementById('refreshNews').click()");await settle({error:{message:'Refresh failure'}});
  await wait("!document.getElementById('refreshNews').disabled");
  assert.equal(await evaluate("document.querySelectorAll('.news-card').length"),2);
  assert.equal(await evaluate("document.getElementById('newsWarning').hidden"),false);
 });
 await t.test('missing configuration and timeout release controls without remote calls',async()=>{
  await navigate('recursos.html?missing');await wait("!!document.querySelector('#resourcesGrid .error-state')");
  assert.equal(await evaluate("document.querySelector('#resourcesGrid .retry-button')"),null);
  await navigate('noticias.html?timeout');await wait("!!document.querySelector('#cardsContainer .error-state')");
  assert.equal(await evaluate("document.getElementById('refreshNews').disabled"),false);
  assert.equal(await evaluate('pending.length'),0);
 });
});
