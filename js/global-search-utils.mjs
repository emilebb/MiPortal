import { newsDetailUrl } from './news-detail-utils.mjs';

export const MAX_QUERY_LENGTH = 120;

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuery(value) {
  return normalizeSearchText(value).slice(0, MAX_QUERY_LENGTH).trim();
}

export function hasSearchQuery(value) {
  return normalizeQuery(value).length > 0;
}

export function formatResultCount(value) {
  const count = Math.max(0, Number(value) || 0);
  return `${count} ${count === 1 ? 'resultado' : 'resultados'}`;
}

function rank(result, query) {
  const title = normalizeSearchText(result.title);
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  const description = normalizeSearchText(result.description);
  if (description.includes(query)) return 3;
  const metadata = normalizeSearchText(`${result.source || ''} ${result.category || ''}`);
  if (metadata.includes(query)) return 4;
  return -1;
}

export function searchResults(results, query) {
  const normalized = normalizeQuery(query);
  if (!normalized || !Array.isArray(results)) return [];
  return results
    .filter((result) => result && typeof result.title === 'string' && result.title.trim())
    .map((result, index) => ({ result, index, score: rank(result, normalized) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ result }) => result);
}

export function filterResults(results, type = 'all') {
  if (type === 'all') return [...results];
  return results.filter((result) => result.type === type);
}

export function newsResultUrl(id) {
  return newsDetailUrl(id);
}

export function resourceResultUrl(value, origin) {
  if (typeof value !== 'string' || !value.trim() || value.trim().startsWith('//')) return null;
  try {
    const base = new URL(origin);
    const url = new URL(value, base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== base.origin) return null;
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
