import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname,dirname,sep} from 'node:path';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const port=Number(process.env.AUDIT_PORT||4174);
const output=process.argv.find(x=>x.startsWith('--output='))?.slice(9);
const results=[];
const runId=randomUUID();
const requestedPage=process.argv.find(x=>x.startsWith('--page='))?.slice(7);
const pages=readdirSync(root).filter(x=>x.endsWith('.html')&&(!requestedPage||x===requestedPage));
if(!pages.length)throw new Error('No matching public audit page');
const cases=pages.flatMap(page=>[390,1440].flatMap(width=>['light','dark'].map(theme=>({page,width,theme}))));
const id='550e8400-e29b-41d4-a716-446655440001';
const fixture=`(()=>{
if(!Object.prototype.hasOwnProperty.call(window,'__miportalAuditCase'))window.__miportalAuditCase=Number(new URLSearchParams(location.search).get('__case'));
localStorage.setItem('miportal-cookie-consent','rejected');
localStorage.setItem('miportal-theme',new URLSearchParams(location.search).get('__theme')||'light');
window.MIPORTAL_SUPABASE={url:'https://fixture.invalid',publishableKey:'fixture-public-key'};
const originalFetch=window.fetch.bind(window);
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin===location.origin)return originalFetch(input,options);
 if(url.origin!=='https://fixture.invalid')throw Error('Audit blocks external fetch');
 if(options.method&&options.method!=='GET')return new Response(JSON.stringify({message:'Audit: writes disabled'}),{status:503});
 const news=[{id:'${id}',published:true,title:'Guía de HTML y accesibilidad para desarrollo web',description:'Contenido ficticio para verificar presentación y accesibilidad.',url:'https://example.invalid/article',source:'Fuente ficticia',image_url:location.origin+'/og-image.svg',published_at:'2026-10-16T12:00:00Z'}];
 const resources=[{id:'fixture-resource',title:'Recurso de HTML',description:'Referencia ficticia',url:'https://example.invalid/resource',category:'HTML',published:true}];
 const data=url.pathname.includes('/news_articles')?news:url.pathname.includes('/resources')?resources:url.pathname.includes('/miportal_daily')?[{daily_date:'2026-10-16',items:[{ranking:1,category:'HTML',title:'Accesibilidad web',summary:'Contenido ficticio de auditoría',source:'Fuente ficticia',source_url:'https://example.invalid/daily'}]}]:[];
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};})();`;
const worker=`
const respond=result=>parent.postMessage({type:'audit-result',caseIndex:window.__miportalAuditCase,result},location.origin);
addEventListener('load',()=>setTimeout(async()=>{
 try{
 const result=await axe.run(document,{iframes:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
 const simplify=r=>({id:r.id,impact:r.impact,help:r.help,nodes:r.nodes.map(n=>({target:n.target,html:n.html,failureSummary:n.failureSummary}))});
 respond({url:location.href,engine:result.testEngine,environment:result.testEnvironment,observedTheme:document.documentElement.getAttribute('data-theme'),violations:result.violations.map(simplify),incomplete:result.incomplete.map(simplify),passedRules:result.passes.map(r=>r.id),layout:{client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}});
 }catch(error){respond({error:String(error)})}
},1500));`;
const runner=`
const cases=${JSON.stringify(cases)};let index=0,timer,recording=false;const frame=document.getElementById('auditFrame'),status=document.getElementById('auditStatus');
function next(){if(index===cases.length){status.textContent='Completado: '+index+'/'+cases.length;frame.remove();return;}const c=cases[index];status.textContent='Ejecutando '+(index+1)+'/'+cases.length+': '+JSON.stringify(c);frame.width=c.width;const params=new URLSearchParams({__audit:'1',__theme:c.theme,__case:String(index)});if(c.page==='noticia.html')params.set('id','${id}');if(c.page==='buscar.html')params.set('q','html');frame.src='/'+c.page+'?'+params;timer=setTimeout(()=>record({error:'Audit page timeout'}),30000)}
async function record(result){if(recording)return;recording=true;clearTimeout(timer);const response=await fetch('/__audit/result',{method:'POST',headers:{'Content-Type':'application/json','X-Audit-Run':'${runId}'},body:JSON.stringify({...cases[index],...result})});if(!response.ok){status.textContent='Error: registro de auditoría rechazado';return;}index++;recording=false;next()}
addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='audit-result'&&e.data.caseIndex===index)record(e.data.result)});next();`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Auditoría local: envíos deshabilitados.'}));return;}
 if(url.pathname==='/__audit/result'){
  if(req.method!=='POST'||req.headers.origin!==`http://127.0.0.1:${server.address().port}`||req.headers['x-audit-run']!==runId||!/^application\/json/.test(req.headers['content-type']||'')){res.writeHead(403).end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000){res.writeHead(413).end();return;}}
  results.push(JSON.parse(body));if(output){const dest=resolve(output);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,JSON.stringify({runId,scope:'Local fixtures, anonymous state; no provider writes; automated axe is not full WCAG certification',results},null,2));}
  res.end('ok');return;
 }
 if(url.pathname==='/__audit/results.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({total:cases.length,completed:results.length,results}));return;}
 if(url.pathname==='/__audit/'){
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Auditoría local</title><h1>Auditoría local de MiPortal</h1><p id="auditStatus" role="status"></p><iframe id="auditFrame" title="Página de prueba" height="900"></iframe><script src="/__audit/runner.js"></script></html>');return;
 }
 const scripts={'/__audit/fixture.js':fixture,'/__audit/worker.js':worker,'/__audit/runner.js':runner};
 if(scripts[url.pathname]){res.setHeader('Content-Type','text/javascript');res.end(scripts[url.pathname]);return;}
 if(url.pathname==='/__audit/axe.js'||url.pathname==='/__audit/sdk.js'){
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL(url.pathname.endsWith('axe.js')?'../node_modules/axe-core/axe.min.js':'../node_modules/@supabase/supabase-js/dist/umd/supabase.js',import.meta.url)));return;
 }
 if(url.pathname==='/supabase-config.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
 let body=await readFile(file);if(extname(file)==='.html')body=body.toString().replace(/https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2(?:\.\d+\.\d+)?/g,'/__audit/sdk.js').replace('<head>','<head><script src="/__audit/fixture.js"></script>').replace('</body>','<script src="/__audit/axe.js"></script><script src="/__audit/worker.js"></script></body>');
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(body);
 }catch(error){res.writeHead(404).end('Audit fixture not found')}});
server.listen(port,'127.0.0.1',()=>console.log('Read-only fixture audit: http://127.0.0.1:'+server.address().port+'/__audit/ ('+cases.length+' cases)'));
