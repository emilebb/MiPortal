import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_QUERY_LENGTH,
  normalizeSearchText,
  normalizeQuery,
  hasSearchQuery,
  searchResults,
  filterResults,
  resourceResultUrl,
  newsResultUrl,
  formatResultCount
} from '../js/global-search-utils.mjs';
import { paginateItems } from '../js/news-page-utils.mjs';
import { relativeDateLabel } from '../js/news-page-utils.mjs';

test('paginates filtered news into stable slices and clamps page bounds', () => {
  const items = Array.from({ length: 31 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(items, 1, 12), {
    items: items.slice(0, 12), page: 1, pageCount: 3, total: 31
  });
  assert.deepEqual(paginateItems(items, 99, 12), {
    items: items.slice(24), page: 3, pageCount: 3, total: 31
  });
  assert.deepEqual(paginateItems([], 1, 12), {
    items: [], page: 1, pageCount: 0, total: 0
  });
});

test('relative news dates use normalized calendar days and a deterministic clock', () => {
  const now = new Date('2026-03-12T12:30:00.000Z');
  assert.equal(relativeDateLabel('2026-03-12', now), 'hoy');
  assert.equal(relativeDateLabel('2026-03-11', now), 'ayer');
  assert.equal(relativeDateLabel('2026-03-04', now), 'hace 8 días');
  assert.equal(relativeDateLabel('2026-03-13', now), null);
  assert.equal(relativeDateLabel('fecha-invalida', now), null);
});

test('normalizes case, accents, and repeated whitespace and bounds queries', () => {
  assert.equal(normalizeSearchText('  JavaScript   práctico  '), 'javascript practico');
  assert.equal(normalizeQuery('  ÁRBOL   Azul  '), 'arbol azul');
  assert.equal(normalizeQuery('x'.repeat(MAX_QUERY_LENGTH + 2)).length, MAX_QUERY_LENGTH);
});

test('ranks exact title, title prefix, title match, description, then source/category stably', () => {
  const results = [
    { title: 'Else', description: 'JavaScript', type: 'news', id: '1' },
    { title: 'JavaScript avanzado', type: 'tutorial', id: '2' },
    { title: 'Un JavaScript útil', type: 'resource', id: '3' },
    { title: 'Otro', source: 'JavaScript', type: 'news', id: '4' },
    { title: 'JavaScript', type: 'news', id: '5' },
    { title: 'JavaScript', type: 'news', id: '6' }
  ];
  assert.deepEqual(searchResults(results, 'javascript').map(({ id }) => id), ['5', '6', '2', '3', '1', '4']);
});

test('filters result types without changing the source results', () => {
  const results = [{ type: 'news' }, { type: 'tutorial' }, { type: 'editorial' }, { type: 'resource' }];
  assert.deepEqual(filterResults(results, 'tutorial'), [results[1]]);
  assert.deepEqual(filterResults(results, 'editorial'), [results[2]]);
  assert.equal(filterResults(results, 'all').length, 4);
});

test('formats a single global-search result count for the status region', () => {
  assert.equal(formatResultCount(0), '0 resultados');
  assert.equal(formatResultCount(1), '1 resultado');
  assert.equal(formatResultCount(12), '12 resultados');
});

test('news result URLs are internal detail routes only for valid UUIDs', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(newsResultUrl(validId), `noticia.html?id=${validId}`);
  assert.equal(newsResultUrl('invalid'), null);
});

test('resource result URLs accept only safe same-origin paths', () => {
  assert.equal(resourceResultUrl('/recursos.html', 'https://miportal.me'), '/recursos.html');
  assert.equal(resourceResultUrl('https://miportal.me/recursos.html', 'https://miportal.me'), '/recursos.html');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'https://evil.example/x', '//evil.example/x']) {
    assert.equal(resourceResultUrl(url, 'https://miportal.me'), null);
  }
});

test('blank query gives no search signal and incomplete result data is ignored', () => {
  assert.equal(hasSearchQuery('   '), false);
  assert.equal(hasSearchQuery('  tema  '), true);
  assert.equal(searchResults([], '   ').length, 0);
  assert.deepEqual(searchResults([{ title: '', type: 'news' }, null], 'tema'), []);
});
