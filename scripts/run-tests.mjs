import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2] || 'all';
for(const script of ['scripts/generate-config.mjs','scripts/build-static.mjs']) {
  const result=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
const suites=readdirSync(new URL('./',import.meta.url)).filter(name=>/\.test\.(?:cjs|mjs)$/.test(name))
  .filter(name=>mode==='all'||(mode==='browser'?/browser|states/.test(name):!/browser|states/.test(name)))
  .map(name=>`scripts/${name}`);
// Build tests recreate public/: parallel readers caused nondeterministic failures.
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...suites],{cwd:root,stdio:'inherit'});
process.exit(result.status|| (result.error?1:0));
