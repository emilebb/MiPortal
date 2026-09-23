const normalize = value =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const words = value =>
  normalize(value).match(/[a-z0-9]+/g) || [];

const topics = {
  css: /\b(css|sass|scss|tailwind|flexbox|container queries|media queries|cascade layers)\b/,
  javascript: /\b(javascript|typescript|ecmascript|react|angular|vue|svelte|node\.?js|next\.?js)\b/,
  frameworks: /\b(react|angular|vue|svelte|next\.?js|nuxt|astro|blazor|django|laravel)\b/,
  accessibility: /\b(accessibility|accesibilidad|wcag|aria|screen reader|lector de pantalla)\b/,
  platform: /\b(html|browser|navegador|chrome|firefox|safari|web api|web performance|web vitals|rendimiento web|wasm|webassembly)\b/
};

const spanishWords = new Set([
  'el', 'la', 'los', 'las', 'un', 'una',
  'de', 'del', 'para', 'con', 'por', 'como',
  'que', 'esta', 'este', 'estas', 'estos',
  'mas', 'muy', 'sobre', 'entre', 'desde',
  'hasta', 'tambien', 'crear', 'usar',
  'puede', 'puedes', 'desarrollo', 'diseno',
  'articulo', 'guia'
]);

const englishWords = new Set([
  'the', 'and', 'for', 'with', 'from',
  'your', 'into', 'using', 'when', 'what',
  'why', 'this', 'that', 'more', 'about',
  'between', 'article', 'guide', 'build',
  'create', 'learn', 'you', 'can'
]);

export function classify(text, categories = []) {
  const signals = normalize(
    `${text} ${categories.join(' ')}`
  );

  return Object.entries(topics)
    .filter(([, pattern]) => pattern.test(signals))
    .map(([category]) => category);
}

export function detectLanguage(text) {
  const tokens = words(text);

  let spanishScore = 0;
  let englishScore = 0;

  tokens.forEach(token => {
    if (spanishWords.has(token)) spanishScore += 1;
    if (englishWords.has(token)) englishScore += 1;
  });

  return englishScore > spanishScore ? 'en' : 'es';
}

export function publicationDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function cleanText(value) {
  if (typeof value !== 'string') return '';

  const doc = new DOMParser().parseFromString(
    value,
    'text/html'
  );

  doc.querySelectorAll(
    'script, style, ol, ul'
  ).forEach(node => node.remove());

  return (doc.body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(value) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) {
      return null;
    }

    url.hash = '';

    return url.href;
  } catch {
    return null;
  }
}

export function prepareItems(rows = []) {
  return rows.flatMap(row => {
    if (!row || typeof row.title !== 'string') {
      return [];
    }

    const link = safeUrl(row.url);

    if (!link) {
      return [];
    }

    const title = cleanText(row.title)
      .slice(0, 300);

    if (!title) {
      return [];
    }

    const description = cleanText(
      row.description || ''
    ).slice(0, 600);

    const text = `${title} ${description}`;

    const language = detectLanguage(text);

    const sourceLabel =
      typeof row.source === 'string' &&
      row.source.trim()
        ? row.source.trim()
        : 'Fuente';

    return [{
      id: row.id,
      title,
      description,
      link,
      date: publicationDate(row.published_at),

      source: {
        label: sourceLabel,
        language
      },

      categories: classify(text),

      searchWords: words(text),

      fetchedAt: row.fetched_at || null
    }];
  });
}

export function selectItems(
  items,
  {
    query = '',
    category = '',
    language = ''
  } = {}
) {
  const terms = words(
    query.slice(0, 120)
  );

  const seen = new Set();

  return items
    .filter(item => {
      const url = new URL(item.link);

      url.hash = '';

      const key = url.href;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return (
        (!category ||
          item.categories.includes(category)) &&

        (!language ||
          item.source.language === language) &&

        terms.every(term =>
          item.searchWords.includes(term)
        )
      );
    })
    .sort(
      (a, b) =>
        (b.date || '').localeCompare(a.date || '') ||

        (a.source.language === 'es' ? 0 : 1) -
        (b.source.language === 'es' ? 0 : 1)
    );
}

export async function loadNews({
  client = window.MiPortalSupabase,
  limit = 100
} = {}) {
  if (!client) {
    throw new Error(
      'El cliente de Supabase no está disponible.'
    );
  }

  const { data, error } = await client
    .from('news_articles')
    .select(`
      id,
      url,
      title,
      description,
      source,
      published_at,
      published,
      fetched_at
    `)
    .eq('published', true)
    .order('published_at', {
      ascending: false
    })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}