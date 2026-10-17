import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
test('build refuses known server-only keys before writing any public configuration',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const file=new URL('../supabase-config.js',import.meta.url);
  const original=readFileSync(file,'utf8');
  const legacy=['fixture',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'fixture'].join('.');
  for(const key of ['sb_secret_TEST_NOT_A_REAL_KEY',legacy]) {
    const result=spawnSync(process.execPath,['scripts/generate-config.mjs'],{cwd:root,encoding:'utf8',
      env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:key}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/Refusing to publish/);
    assert.equal(readFileSync(file,'utf8'),original);assert.equal(result.stderr.includes(key),false);
  }
});
