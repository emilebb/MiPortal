import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../public/',import.meta.url));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)])}
test('all compiled local page, script, stylesheet and image targets exist inside public',()=>{
 const pages=files(root).filter(f=>f.endsWith('.html'));assert.equal(pages.length,21);
 for(const file of pages){
  const html=readFileSync(file,'utf8');
  for(const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
   const target=match[1];assert.ok(!target.startsWith('javascript:'),`${file}: unsafe link`);
   if(/^(?:[a-z]+:|\/\/|#)/i.test(target))continue;
   const pathname=decodeURIComponent(target.split(/[?#]/)[0]);if(!pathname)continue;
   if(pathname.startsWith('/api/'))continue;
   let dest=pathname.startsWith('/')?resolve(root,'.'+pathname):resolve(dirname(file),pathname);
   assert.ok(!relative(root,dest).startsWith('..'+sep),`${file}: outside public`);
   assert.ok(existsSync(dest),`${file}: missing ${target}`);
   if(statSync(dest).isDirectory())assert.ok(existsSync(resolve(dest,'index.html')),`${file}: missing directory index ${target}`);
  }
 }
});
test('compiled JavaScript module imports resolve, including browser fixture dependencies',()=>{
 for(const file of files(root).filter(f=>/\.m?js$/.test(f))){
  const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([.][^'"]+)['"]/g)){
   assert.ok(existsSync(resolve(dirname(file),match[1])),`${file}: missing ${match[1]}`);
  }
 }
});
