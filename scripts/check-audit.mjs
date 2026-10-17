import {readFileSync,readdirSync} from 'node:fs';
import {summarizeAudit} from './audit-summary.mjs';
if(!process.argv[2]){console.error('Usage: node scripts/check-audit.mjs report.json');process.exit(1)}
const requestedPage=process.argv.find(x=>x.startsWith('--page='))?.slice(7);
const pages=readdirSync(new URL('../public/',import.meta.url)).filter(x=>x.endsWith('.html')&&(!requestedPage||x===requestedPage));
if(!pages.length)throw new Error('No matching public audit page');
const summary=summarizeAudit(JSON.parse(readFileSync(process.argv[2],'utf8')),pages);
console.log(JSON.stringify(summary,null,2));
process.exitCode=summary.status==='failed'?1:summary.status==='manual-review-required'?2:0;
