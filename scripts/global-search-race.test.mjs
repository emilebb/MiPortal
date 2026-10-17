import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as utils from '../js/global-search-utils.mjs';
const source=readFileSync(new URL('../js/global-search.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function fixture(){
 const pending=[];const resources=[];
 class Element{constructor(){this.value='';this.attrs={};this.children=[]}addEventListener(){}setAttribute(k,v){this.attrs[k]=v}removeAttribute(k){delete this.attrs[k]}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}}
 const nodes=Object.fromEntries(['globalSearchForm','globalSearchQuery','globalSearchFilter','globalSearchStatus','globalSearchResults'].map(id=>[id,new Element()]));
 const document={getElementById:id=>nodes[id],createElement:()=>new Element(),createDocumentFragment:()=>new Element()};
 const query={select(){return this},eq(){return this},limit(){return this},abortSignal(signal){assert.ok(signal instanceof AbortSignal);return new Promise(resolve=>resources.push(resolve))}};
 const ctx={...utils,document,window:{location:{search:'',origin:'https://example.test'},MiPortalSupabase:{from:()=>query}},loadNews:()=>new Promise(resolve=>pending.push(resolve)),URLSearchParams,AbortSignal,history:{replaceState(){}},console};
 runInNewContext(source+'\nthis.search=runSearch;',ctx);
 return{ctx,nodes,pending,resources};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('global search ignores a slow older response and keeps the latest result',async()=>{
 const f=fixture();const old=f.ctx.search('html');const latest=f.ctx.search('n8n');await tick();
 f.pending[1]([]);f.resources[1]({data:[]});await latest;
 assert.equal(f.nodes.globalSearchQuery.value,'n8n');
 const latestStatus=f.nodes.globalSearchStatus.textContent;
 f.pending[0]([]);f.resources[0]({data:[]});await old;
 assert.equal(f.nodes.globalSearchStatus.textContent,latestStatus);
 assert.equal(f.nodes.globalSearchQuery.value,'n8n');
});
test('clearing a pending search releases busy state and old completion cannot replace the empty prompt',async()=>{
 const f=fixture();const pending=f.ctx.search('html');await tick();
 assert.equal(f.nodes.globalSearchForm.attrs['aria-busy'],'true');
 await f.ctx.search('');assert.equal(f.nodes.globalSearchForm.attrs['aria-busy'],undefined);
 const prompt=f.nodes.globalSearchStatus.textContent;
 f.pending[0]([]);f.resources[0]({data:[]});await pending;
 assert.equal(f.nodes.globalSearchStatus.textContent,prompt);
});
