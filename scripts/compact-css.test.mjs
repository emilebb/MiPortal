import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCss} from './compact-css.mjs';
test('CSS compaction preserves cascade, modern values, relative URLs and license comments',()=>{
  const css=`/*! license */
  :root { --gap: 1rem; --brand: 34 54 92; }
  .card { color: red; width: calc(100% - 2 * var(--gap)); background: url('../image.svg'); }
  .card { color: blue; }
  @media (prefers-reduced-motion: reduce) { .card:has(a:focus-visible) { transition: none; } }`;
  const output=compactCss(css);
  assert.ok(output.length<css.length);
  assert.match(output,/license/);
  assert.ok(output.indexOf('color:red')<output.indexOf('color:blue'));
  assert.match(output,/calc\(100% - 2 \* var\(--gap\)\)/);
  assert.match(output,/\.\.\/image\.svg/);
  assert.match(output,/prefers-reduced-motion:\s*reduce/);
  assert.match(output,/:has\(a:focus-visible\)/);
});
test('CSS build rejects malformed input rather than emitting an incomplete stylesheet',()=>{
  assert.throws(()=>compactCss('.card { color: red; }}'),/CSS build rejected/);
});
