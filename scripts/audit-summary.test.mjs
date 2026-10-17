import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAudit} from './audit-summary.mjs';
const clean=()=>({results:[390,1440].flatMap(width=>['light','dark'].map(theme=>({page:'a.html',width,theme,observedTheme:theme,environment:{windowWidth:width},engine:{name:'axe-core'},violations:[],incomplete:[],passedRules:['label'],layout:{client:width,scroll:width}})))});
test('audit requires all page, width and theme combinations',()=>{
 assert.equal(summarizeAudit(clean(),['a.html']).status,'automated-checks-passed');
 const partial=clean();partial.results.pop();assert.equal(summarizeAudit(partial,['a.html']).missing.length,1);
});
test('duplicate and unexpected cases cannot substitute missing cases',()=>{
 const report=clean();report.results[3]={...report.results[0]};
 assert.equal(summarizeAudit(report,['a.html']).duplicates.length,1);
 assert.equal(summarizeAudit(report,['a.html']).status,'failed');
});
test('violations and runtime errors fail the automated gate',()=>{
 const report=clean();report.results[0].violations=[{id:'color-contrast'}];report.results[1].error='timeout';
 const summary=summarizeAudit(report,['a.html']);assert.equal(summary.violationCount,1);assert.equal(summary.errors.length,1);assert.equal(summary.status,'failed');
});
test('incomplete findings always require manual review',()=>{
 const report=clean();report.results[0].incomplete=[{id:'color-contrast'}];
 assert.equal(summarizeAudit(report,['a.html']).status,'manual-review-required');
});
test('layout overflow and absent executed rules cannot be reported as passes',()=>{
 const report=clean();report.results[0].layout.scroll++;report.results[1].passedRules=[];
 const summary=summarizeAudit(report,['a.html']);assert.equal(summary.overflows.length,1);assert.equal(summary.errors.length,1);assert.equal(summary.status,'failed');
});
