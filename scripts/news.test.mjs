import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  sources, publicationDate, classify, prepareItems, selectItems, loadFeeds
} from '../js/news-feed.mjs';

// Fixtures aisladas: nunca se sirven como contenido público.
const source = sources.find(item => item.id === 'smashing');
const spanish = sources.find(item => item.id === 'paradigma');
const fixture = (overrides = {}) => ({
  title: 'Stop Treating CSS Container Queries Like Traditional Media Queries',
  link: 'https://smashingmagazine.com/2026/09/stop-treating-css-container-queries-traditional-media-queries/',
  pubDate: '2026-09-16 10:00:00', categories: ['CSS'], ...overrides
});
const plain = value => typeof value === 'string' ? value : '';

test('news page CSP allows the complete rss2json origin', async () => {
  const html = await readFile(new URL('../noticias.html', import.meta.url), 'utf8');
  const directive = html.match(/connect-src[^;]+;/)?.[0] || '';
  assert.ok(directive.includes('https://api.rss2json.com'));
  assert.equal(directive.includes('https://api.rss2json '), false);
});

test('publication calendar dates never fall back to today or normalize bad dates', () => {
  for (const value of [null, undefined, '', 'invalid', '2026-02-30 00:00:00',
    'mi., 26 ago. 2026 09:00:00 +0200', '2026-09-16junk']) {
    assert.equal(publicationDate(value), null);
  }
  assert.equal(publicationDate('2026-09-16 10:00:00'), '2026-09-16');
  assert.equal(publicationDate('2024-02-29'), '2024-02-29');
});

test('categories use topic signals, not publisher names or Java substrings', () => {
  assert.ok(classify('CSS random()', []).includes('css'));
  assert.ok(classify('Container queries and cascade layers', []).includes('css'));
  assert.ok(classify('Angular Zoneless', []).includes('javascript'));
  assert.ok(classify('React 19.3', []).includes('frameworks'));
  assert.ok(classify('Keyboard navigation', ['Accessibility']).includes('accessibility'));
  assert.deepEqual(classify('Java concurrency', []), []);
  const items = prepareItems([fixture({ title: 'React 19.3', categories: [] })],
    source, plain);
  assert.equal(items[0].categories.includes('css'), false);
});

test('CSS-Tricks attribution footer is not a CSS topic signal', () => {
  const cssSource = sources.find(item => item.id === 'css-tricks');
  const [item] = prepareItems([{
    title: 'WordPress.com Student Plan',
    link: 'https://css-tricks.com/wordpress-student-plan/',
    categories: ['Links', 'education', 'WordPress'],
    description: '<p>Building a WordPress site makes for a great final project.</p>' +
      '<hr><p><small>Originally published on CSS-Tricks.</small></p>'
  }], cssSource, value => value.replace(/<[^>]*>/g, ' '));
  assert.equal(item.categories.includes('css'), false);
  assert.equal(item.description.includes('CSS-Tricks'), false);
});

test('web relevance, trusted original links, deduplication and chronology', () => {
  const items = prepareItems([
    fixture(), fixture(), fixture({ link: 'https://evil.example/css' }),
    fixture({ link: 'javascript:alert(1)' }),
    fixture({ link: 'https://smashingmagazine.com.evil.example/css' }),
    fixture({ link: 'https://user@smashingmagazine.com/css' }),
    fixture({ title: null }),
    fixture({ link: 'https://smashingmagazine.com/undated', pubDate: null }),
    fixture({ link: 'https://smashingmagazine.com/older', pubDate: '2026-08-31' })
  ], source, plain);
  const result = selectItems(items);
  assert.equal(result.length, 3);
  assert.equal(result[0].date, '2026-09-16');
  assert.equal(result[2].date, null);
  assert.equal(result[0].link, fixture().link);
  assert.equal(result[0].source.label, 'Smashing Magazine');
  assert.equal(prepareItems([fixture({ title: 'Corporate AI strategy',
    categories: [], link: 'https://www.paradigmadigital.com/tech/ai/' })],
  spanish, plain).length, 0);
});

test('category, language and accent-insensitive AND search combine before limit', () => {
  const items = prepareItems([fixture()], source, plain).concat(prepareItems([
    fixture({ title: 'Angular Zoneless: detección de cambios', categories: [],
      link: 'https://www.paradigmadigital.com/dev/angular-zoneless-siguiente-paso-evolucion-deteccion-cambios/',
      pubDate: '2026-09-04 06:00:00' })
  ], spanish, plain));
  assert.equal(selectItems(items, { category: 'javascript', language: 'es',
    query: 'angular deteccion' }).length, 1);
  assert.equal(selectItems(items, { category: 'css', language: 'es' }).length, 0);
  assert.equal(selectItems(items, { query: 'Java' }).length, 0);
  assert.equal(selectItems(items, { query: '' }).length, 2);
  assert.equal(selectItems(items, { query: 'angular missing' }).length, 0);
});

test('parallel loads isolate partial, total, malformed and timeout failures', async () => {
  const ok = { ok: true, json: async () => ({ status: 'ok', items: [fixture()] }) };
  let calls = 0;
  const partial = await loadFeeds({ sources: sources.slice(0, 2),
    fetcher: async () => { if (calls++) throw Error('offline'); return ok; } });
  assert.deepEqual(partial.map(result => result.status), ['fulfilled', 'rejected']);
  const failed = await loadFeeds({ fetcher: async () => ({ ok: false }) });
  assert.ok(failed.every(result => result.status === 'rejected'));
  const malformed = await loadFeeds({ fetcher: async () => ({ ok: true,
    json: async () => ({ status: 'ok', items: null }) }) });
  assert.ok(malformed.every(result => result.status === 'rejected'));
  let aborted = 0;
  const timed = await loadFeeds({ timeoutMs: 5,
    fetcher: (_url, { signal }) => new Promise(() => {
      signal.addEventListener('abort', () => aborted++);
    }) });
  assert.equal(aborted, sources.length);
  assert.ok(timed.every(result => result.status === 'rejected'));
  const retry = await loadFeeds({ fetcher: async () => ok });
  assert.ok(retry.every(result => result.status === 'fulfilled'));
});
