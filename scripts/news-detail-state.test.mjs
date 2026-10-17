import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as utils from '../js/news-detail-utils.mjs';
import * as media from '../js/news-detail-media.mjs';
const source=readFileSync(new URL('../js/news-detail.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.classList={add(){}}}
 append(...children){this.children.push(...children)}replaceChildren(...children){this.replacements=(this.replacements||0)+1;this.children=children}
 addEventListener(){}setAttribute(){}remove(){this.removed=true}
}
async function page(search,responses){
 const nodes=Object.fromEntries(['articleStatus','newsArticle','relatedNews','relatedSection','breadcrumbTitle'].map(x=>[x,new Element()]));
 const document={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),querySelector:()=>null};
 let calls=0;const errors=[];
 const query={select(){return this},eq(){return this},neq(){return this},order(){return this},limit(){return this},abortSignal(signal){assert.ok(signal instanceof AbortSignal);const value=responses[calls++];return value instanceof Error?Promise.reject(value):Promise.resolve(value)}};
 runInNewContext(source,{...utils,createArticleImage:(s,f)=>media.createArticleImage(s,f,document),createRelatedImage:(s,f)=>media.createRelatedImage(s,f,document),document,window:{MiPortalSupabase:{from:()=>query}},location:{search,href:'https://example.test/noticia.html'+search},URL,URLSearchParams,AbortSignal,Intl,console:{error:(...x)=>errors.push(x)}});
 await new Promise(r=>setImmediate(r));return{nodes,calls,errors};
}
const id='550e8400-e29b-41d4-a716-446655440001';
test('optional related failure preserves an already rendered article and does not announce a load failure',async()=>{
 const state=await page('?id='+id,[{data:[{id,title:'Noticia de prueba',url:'https://example.test/article',published:true}]},new Error('Optional failure')]);
 assert.equal(state.calls,2);assert.equal(state.nodes.articleStatus.removed,true);
 assert.equal(state.nodes.newsArticle.children[0].tag,'article');
 assert.equal(state.nodes.articleStatus.replacements,1,'only the initial loading status was announced');
 assert.equal(state.errors.length,0);
});
test('invalid IDs never query the backend; failed article requests retain a recoverable error state',async()=>{
 const invalid=await page('?id=invalid',[]);assert.equal(invalid.calls,0);
 assert.equal(invalid.nodes.articleStatus.children[0].textContent,'Noticia no encontrada');
 const failed=await page('?id='+id,[{data:null,error:new Error('Controlled timeout')}]);
 assert.equal(failed.calls,1);assert.equal(failed.nodes.articleStatus.removed,undefined);
 assert.match(failed.nodes.articleStatus.children[0].textContent,/No pudimos cargar/);
});
