import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isImageWidthSufficient } from '../js/image-utils.mjs';

import {
  isNewsId,
  safeNewsUrl,
  newsDetailUrl,
  absoluteNewsDetailUrl,
  relatedNews
} from '../js/news-detail-utils.mjs';

const current = '550e8400-e29b-41d4-a716-446655440000';

test('news detail accepts UUIDs only and builds an encoded internal URL', () => {
  assert.equal(isNewsId(current), true);
  assert.equal(isNewsId('1'), false);
  assert.equal(isNewsId('550e8400-e29b-41d4-a716-44665544000z'), false);
  assert.equal(newsDetailUrl(current), `noticia.html?id=${current}`);
  assert.equal(newsDetailUrl('invalid'), null);
  assert.equal(absoluteNewsDetailUrl(current, 'https://miportal.me/news/noticia.html?id=old'), `https://miportal.me/news/noticia.html?id=${current}`);
  assert.equal(absoluteNewsDetailUrl('invalid', 'https://miportal.me/noticia.html'), null);
});

test('news detail external URLs allow only HTTP and HTTPS', () => {
  assert.equal(safeNewsUrl('https://example.com/story'), 'https://example.com/story');
  assert.equal(safeNewsUrl('http://example.com/story'), 'http://example.com/story');
  assert.equal(safeNewsUrl('javascript:alert(1)'), null);
  assert.equal(safeNewsUrl('//example.com/story'), null);
});

test('related news excludes the current item, unpublished and incomplete rows, and caps at three', () => {
  const rows = [
    { id: current, published: true, title: 'Current', url: 'https://example.com/current' },
    ...[1, 2, 3, 4].map((n) => ({ id: `550e8400-e29b-41d4-a716-44665544000${n}`, published: true, title: `Story ${n}` })),
    { id: '550e8400-e29b-41d4-a716-446655440099', published: false, title: 'Draft', url: 'https://example.com/draft' },
    { id: '550e8400-e29b-41d4-a716-446655440098', published: true, url: 'https://example.com/missing' }
  ];
  assert.deepEqual(relatedNews(rows, current).map((item) => item.id), [
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440003'
  ]);
});

test('news detail uses visual-only breadcrumb truncation and responsive related media', () => {
  const css = readFileSync('styles.css', 'utf8');
  assert.match(css, /\.news-detail-breadcrumb #breadcrumbTitle\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.news-detail-header h1\s*\{[^}]*font-size:\s*clamp\(1\.65rem/);
  assert.match(css, /\.related-news-grid\s*\{[^}]*auto-fit/);
  assert.match(css, /\.related-news-card img\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
});

test('image width policy keeps reasonable media and rejects undersized sources', () => {
  for (const width of [0, 1, 319, 479, NaN, Infinity]) assert.equal(isImageWidthSufficient(width), false);
  for (const width of [480, 640, 1920]) assert.equal(isImageWidthSufficient(width), true);
});
