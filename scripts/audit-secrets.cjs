const {spawnSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
const args=['--git-dir=.git','--work-tree=.'];
const listing=spawnSync('git',[...args,'rev-list','--objects','--all'],{encoding:'utf8'});if(listing.status)throw Error('Cannot enumerate repository');
const objects=listing.stdout.trim().split('\n').map(line=>{const i=line.indexOf(' ');return{oid:line.slice(0,i),path:line.slice(i+1)}}).filter(x=>/\.(?:[cm]?js|sql|md|json|ya?ml|html|txt|toml)$|(?:^|\/)\.env(?:\..*)?$/.test(x.path));
const batch=spawnSync('git',[...args,'cat-file','--batch'],{input:objects.map(o=>o.oid).join('\n')+'\n',maxBuffer:100*1024*1024});if(batch.status)throw Error('Cannot read repository objects');
let offset=0,scanned=0;const candidates=[];
for(const obj of objects){const end=batch.stdout.indexOf(10,offset);const header=batch.stdout.subarray(offset,end).toString();const size=Number(header.split(' ')[2]);offset=end+1;const bytes=batch.stdout.subarray(offset,offset+size);offset+=size+1;if(size>2000000||!header.includes(' blob '))continue;scanned++;
 const text=bytes.toString('utf8');const findings=[];
 for(const m of text.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){try{if(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role==='service_role')findings.push({at:m.index,type:'JWT service_role'})}catch{}}
 for(const [type,pattern] of [['Supabase secret',/sb_secret_[A-Za-z0-9_-]{24,}/g],['Stripe live secret',/sk_live_[A-Za-z0-9]{24,}/g],['Mercado Pago token candidate',/APP_USR-[A-Za-z0-9_-]{30,}/g],['Resend token candidate',/re_[A-Za-z0-9]{30,}/g]])for(const m of text.matchAll(pattern))findings.push({at:m.index,type});
 for(const finding of findings)candidates.push({blob:obj.oid,path:obj.path,line:text.slice(0,finding.at).split('\n').length,type:finding.type,classification:/scripts\/|test|example|fixture/.test(obj.path)?'test_or_example_candidate':'review_required'});
}
const report={scope:'Tracked text blobs in local Git history; known token patterns only; no values exported and no credentials validated or used',text_blobs_scanned:scanned,candidates};const dest=process.argv[2]||'artifacts/secret-patterns.json';fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2));console.log({scanned,candidates:candidates.length,review_required:candidates.filter(x=>x.classification==='review_required').length});
