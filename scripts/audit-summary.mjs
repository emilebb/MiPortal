export function summarizeAudit(report,pages) {
 const results=Array.isArray(report.results)?report.results:[];
 const expected=pages.flatMap(page=>[390,1440].flatMap(width=>['light','dark'].map(theme=>`${page}|${width}|${theme}`)));
 const seen=new Set(),duplicates=[],unexpected=[],errors=[],overflows=[];
 let violationCount=0,incompleteCount=0;
 for(const r of results){
  const key=`${r.page}|${r.width}|${r.theme}`;
  if(seen.has(key))duplicates.push(key);seen.add(key);
  if(!expected.includes(key))unexpected.push(key);
  if(r.error||!Array.isArray(r.violations)||!Array.isArray(r.incomplete)||!Array.isArray(r.passedRules)||!r.passedRules.length||r.engine?.name!=='axe-core'||r.observedTheme!==r.theme||r.environment?.windowWidth!==r.width)errors.push(key);
  violationCount+=(r.violations||[]).length;incompleteCount+=(r.incomplete||[]).length;
  if(!r.layout||r.layout.scroll>r.layout.client)overflows.push(key);
 }
 const missing=expected.filter(key=>!seen.has(key));
 const failed=missing.length||duplicates.length||unexpected.length||errors.length||overflows.length||violationCount;
 return {status:failed?'failed':incompleteCount?'manual-review-required':'automated-checks-passed',expectedCases:expected.length,completedCases:results.length,violationCount,incompleteCount,missing,duplicates,unexpected,errors,overflows,scope:'Anonymous local fixtures; automated checks do not certify WCAG, real providers or protected admin pages'};
}
