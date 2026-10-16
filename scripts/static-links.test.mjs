import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
test('all compiled internal page/asset links resolve to shipped files',()=>{
  const root=fileURLToPath(new URL('../public/',import.meta.url));
  const failures=[];
  const walk=dir=>{
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const file=join(dir,entry.name);
      if(entry.isDirectory()){walk(file);continue}
      if(!file.endsWith('.html'))continue;
      const base=new URL(relative(root,file).replaceAll('\\','/'),'https://local.invalid/');
      for(const match of readFileSync(file,'utf8').matchAll(/\b(?:href|src)="([^"]+)"/g)) {
        const url=new URL(match[1],base);
        if(url.origin!==base.origin || url.pathname.startsWith('/api/'))continue;
        const target=join(root,decodeURIComponent(url.pathname));
        const resolved=url.pathname.endsWith('/')?join(target,'index.html'):target;
        if(!existsSync(resolved))failures.push(`${relative(root,file)} → ${match[1]}`);
      }
    }
  };
  walk(root);assert.deepEqual(failures,[]);
});
