import { loadNews } from './news-feed.mjs';
import { filterResults, hasSearchQuery, normalizeQuery, newsResultUrl, resourceResultUrl, searchResults } from './global-search-utils.mjs';

const curatedContent = [
  {
    type: 'tutorial',
    title: 'Crear un formulario HTML accesible',
    description: 'Guía introductoria para construir formularios claros y accesibles con etiquetas, instrucciones y validación nativa.',
    category: 'HTML · Accesibilidad',
    url: '/tutorial.html'
  },
  {
    type: 'editorial',
    title: 'Automatizaciones con n8n',
    description: 'Introducción a la automatización de tareas con n8n: disparadores, acciones y diseño de flujos.',
    category: 'Automatización · n8n',
    url: '/automatizaciones-n8n.html'
  }
];

const form = document.getElementById('globalSearchForm');
const queryInput = document.getElementById('globalSearchQuery');
const filterInput = document.getElementById('globalSearchFilter');
const status = document.getElementById('globalSearchStatus');
const resultsRegion = document.getElementById('globalSearchResults');

let matchingResults = [];

function fromNews(row) {
  if (!row || typeof row.title !== 'string' || !row.title.trim()) return null;
  const link = newsResultUrl(row.id);
  if (!link) return null;
  return {
    type: 'news', title: row.title.trim(), description: typeof row.description === 'string' ? row.description : '',
    source: typeof row.source === 'string' ? row.source : '', date: row.published_at, url: link
  };
}

function fromResource(row) {
  if (!row || typeof row.title !== 'string' || !row.title.trim()) return null;
  return {
    type: 'resource', title: row.title.trim(), description: typeof row.description === 'string' ? row.description : '',
    category: typeof row.category === 'string' ? row.category : '',
    url: resourceResultUrl(row.url, window.location.origin), date: row.updated_at || row.created_at
  };
}

function resultNode(item) {
  const article = document.createElement('article');
  article.className = 'global-search-result';
  const heading = document.createElement('h2');
  const title = document.createElement(item.url ? 'a' : 'span');
  title.textContent = item.title;
  if (item.url) title.href = item.url;
  heading.append(title);
  article.append(heading);
  const description = document.createElement('p');
  description.textContent = item.description;
  if (item.description) article.append(description);
  const metadata = document.createElement('p');
  metadata.className = 'global-search-meta';
  const labels = { news: 'Noticia', tutorial: 'Tutorial', editorial: 'Artículo', resource: 'Recurso' };
  metadata.textContent = [labels[item.type], item.source, item.category].filter(Boolean).join(' · ');
  article.append(metadata);
  if (item.date && Number.isFinite(new Date(item.date).getTime())) {
    const time = document.createElement('time');
    time.dateTime = item.date;
    time.textContent = new Date(item.date).toLocaleDateString('es-ES', { dateStyle: 'medium' });
    article.append(time);
  }
  return article;
}

function render() {
  if (!hasSearchQuery(queryInput.value)) {
    resultsRegion.replaceChildren();
    status.textContent = 'Escribe un término para comenzar la búsqueda.';
    return;
  }
  const shown = filterResults(matchingResults, filterInput.value);
  resultsRegion.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = `Resultados para “${queryInput.value}”: ${shown.length} ${shown.length === 1 ? 'resultado' : 'resultados'}`;
  resultsRegion.append(heading);
  if (!shown.length) {
    status.textContent = matchingResults.length
      ? `No hay resultados para “${queryInput.value}” en esta categoría. Prueba otro filtro.`
      : `No se encontraron resultados para “${queryInput.value}”. Prueba con otras palabras o explora noticias, tutoriales y recursos.`;
    const links = document.createElement('p');
    links.className = 'global-search-empty-links';
    for (const [label, href] of [['Noticias', '/noticias.html'], ['Tutoriales', '/tutoriales.html'], ['Recursos', '/recursos.html']]) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      links.append(link);
    }
    resultsRegion.append(links);
    return;
  }
  status.textContent = heading.textContent;
  const fragment = document.createDocumentFragment();
  shown.forEach((item) => fragment.append(resultNode(item)));
  resultsRegion.append(fragment);
}

async function runSearch(query) {
  const normalized = normalizeQuery(query);
  queryInput.value = normalized;
  matchingResults = [];
  resultsRegion.replaceChildren();
  if (!hasSearchQuery(normalized)) {
    status.textContent = 'Escribe un término para comenzar la búsqueda.';
    return;
  }
  status.textContent = 'Buscando en el contenido publicado…';
  form.setAttribute('aria-busy', 'true');
  try {
    const outcomes = await Promise.allSettled([
      loadNews({ limit: 100 }),
      Promise.resolve().then(async () => {
        if (!window.MiPortalSupabase) throw new Error('Recursos no disponibles');
        const { data, error } = await window.MiPortalSupabase.from('resources')
          .select('id,title,description,url,category,created_at,updated_at')
          .eq('published', true).limit(100);
        if (error) throw error;
        return data || [];
      })
    ]);
    const [newsOutcome, resourceOutcome] = outcomes;
    matchingResults = [
      ...(newsOutcome.status === 'fulfilled' ? newsOutcome.value.map(fromNews).filter(Boolean) : []),
      ...curatedContent,
      ...(resourceOutcome.status === 'fulfilled' ? resourceOutcome.value.map(fromResource).filter(Boolean) : [])
    ];
    const hasFailure = outcomes.some((outcome) => outcome.status === 'rejected');
    matchingResults = searchResults(matchingResults, normalized);
    render();
    if (hasFailure) {
      const count = filterResults(matchingResults, filterInput.value).length;
      status.textContent = count
        ? `Resultados para “${normalized}”: ${count} ${count === 1 ? 'resultado' : 'resultados'}. Algunos contenidos no pudieron cargarse.`
        : `Resultados para “${normalized}”: 0 resultados. No se pudieron cargar todos los contenidos; prueba de nuevo más tarde.`;
    }
  } catch {
    status.textContent = `Resultados para “${normalized}”: 0 resultados. No se pudo completar la búsqueda; prueba de nuevo más tarde.`;
  } finally {
    form.removeAttribute('aria-busy');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = normalizeQuery(queryInput.value);
  const params = new URLSearchParams(window.location.search);
  if (query) params.set('q', query);
  else params.delete('q');
  history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  runSearch(query);
});
filterInput.addEventListener('change', render);

const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
queryInput.value = normalizeQuery(initialQuery);
if (queryInput.value) runSearch(queryInput.value);
