export const sources = [
  { id: 'paradigma', label: 'Paradigma Digital', language: 'es',
    feed: 'https://www.paradigmadigital.com/feed/',
    hosts: ['www.paradigmadigital.com', 'paradigmadigital.com'], general: true },
  { id: 'campus', label: 'campusMVP', language: 'es',
    feed: 'https://www.campusmvp.es/recursos/syndication.axd',
    hosts: ['www.campusmvp.es'], general: true },
  { id: 'smashing', label: 'Smashing Magazine', language: 'en',
    feed: 'https://www.smashingmagazine.com/feed/',
    hosts: ['smashingmagazine.com', 'www.smashingmagazine.com'] },
  { id: 'css-tricks', label: 'CSS-Tricks', language: 'en',
    feed: 'https://css-tricks.com/feed/', hosts: ['css-tricks.com'] },
  { id: 'react', label: 'React', language: 'en',
    feed: 'https://react.dev/rss.xml', hosts: ['react.dev'] }
];

const normalize = value => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = value => normalize(value).match(/[a-z0-9]+/g) || [];
const topics = {
  css: /\b(css|sass|scss|tailwind|flexbox|container queries|media queries|cascade layers)\b/,
  javascript: /\b(javascript|typescript|ecmascript|react|angular|vue|svelte|node\.?js|next\.?js)\b/,
  frameworks: /\b(react|angular|vue|svelte|next\.?js|nuxt|astro|blazor|django|laravel)\b/,
  accessibility: /\b(accessibility|accesibilidad|wcag|aria|screen reader|lector de pantalla)\b/,
  platform: /\b(html|browser|navegador|chrome|firefox|safari|web api|web performance|web vitals|rendimiento web|wasm|webassembly)\b/
};

export function classify(text, categories = []) {
  const signals = normalize(`${text} ${categories.join(' ')}`);
  return Object.entries(topics).filter(([, pattern]) => pattern.test(signals))
    .map(([category]) => category);
}

export function publicationDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  const isoDate = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const rfcDate = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:GMT|UTC|[+-]\d{4})$/i;
  if (!isoDate.test(trimmed) && !rfcDate.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() !== Number(month) - 1 ||
        check.getUTCDate() !== Number(day)) return null;
    return `${year}-${month}-${day}`;
  }
  return parsed.toISOString().slice(0, 10);
}

function safeLink(value, source) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.port && source.hosts.includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

export function prepareItems(items, source, cleanText) {
  return items.flatMap(item => {
    if (!item || typeof item.title !== 'string') return [];
    const link = safeLink(item.link, source);
    const title = cleanText(item.title).slice(0, 300);
    if (!link || !title) return [];
    let summary = item.description || item.content || '';
    // El pie de atribución de CSS-Tricks no describe el tema del artículo.
    if (source.id === 'css-tricks' && typeof summary === 'string') {
      summary = summary.split(/<hr\b[^>]*>/i)[0];
    }
    const description = cleanText(summary).slice(0, 600);
    const tags = Array.isArray(item.categories)
      ? item.categories.filter(value => typeof value === 'string') : [];
    const text = `${title} ${description}`;
    const categories = classify(text, tags);
    if (source.general && !categories.length &&
      !/\b(web|frontend|front-end|backend|back-end)\b/.test(normalize(text))) return [];
    return [{ title, description, link, date: publicationDate(item.pubDate),
      source, categories, searchWords: words(`${text} ${tags.join(' ')}`) }];
  });
}

export function selectItems(items, { query = '', category = '', language = '' } = {}) {
  const terms = words(query.slice(0, 120));
  const seen = new Set();
  return items.filter(item => {
    const url = new URL(item.link);
    url.hash = '';
    const key = url.href;
    if (seen.has(key)) return false;
    seen.add(key);
    return (!category || item.categories.includes(category)) &&
      (!language || item.source.language === language) &&
      terms.every(term => item.searchWords.includes(term));
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
    (a.source.language === 'es' ? 0 : 1) - (b.source.language === 'es' ? 0 : 1));
}

export async function loadFeeds({ sources: selected = sources,
  fetcher = fetch, timeoutMs = 10000 } = {}) {
  return Promise.allSettled(selected.map(async source => {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Feed timeout'));
      }, timeoutMs);
    });
    try {
      const request = (async () => {
        const url = 'https://api.rss2json.com/v1/api.json?rss_url=' +
          encodeURIComponent(source.feed);
        const response = await fetcher(url, {
          headers: { Accept: 'application/json' }, signal: controller.signal
        });
        if (!response.ok) throw new Error('Feed HTTP error');
        const data = await response.json();
        if (data?.status !== 'ok' || !Array.isArray(data.items)) {
          throw new Error('Invalid feed response');
        }
        return data.items;
      })();
      return await Promise.race([request, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }));
}
