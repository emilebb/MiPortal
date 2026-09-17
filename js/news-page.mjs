import { sources, prepareItems, selectItems, loadFeeds } from './news-feed.mjs';

const grid = document.getElementById('cardsContainer');
const form = document.getElementById('searchForm');
const input = document.getElementById('searchInput');
const language = document.getElementById('newsLanguage');
const refresh = document.getElementById('refreshNews');
const notice = document.getElementById('newsStatus');
const updated = document.getElementById('lastUpdated');
const buttons = document.querySelectorAll('.filter-btn[data-query]');
const cache = new Map();
let category = '';
let loading = false;
let failures = [];

function cleanText(value) {
  if (typeof value !== 'string') return '';
  const doc = new DOMParser().parseFromString(value, 'text/html');
  doc.querySelectorAll('script, style, ol, ul').forEach(node => node.remove());
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function card(item) {
  const article = element('article', 'card news-card');
  const body = element('div', 'card-body');
  const languageLabel = item.source.language === 'es' ? 'Español' : 'Inglés';
  body.append(element('span', 'tag', `${item.source.label} · ${languageLabel}`));
  const title = element('h3', '', item.title);
  const description = element('p', 'card-description', item.description ||
    'Leé el artículo completo en su fuente original.');
  title.lang = description.lang = item.source.language;
  body.append(title, description);
  const date = element(item.date ? 'time' : 'span', 'news-date');
  if (item.date) {
    date.dateTime = item.date;
    const [year, month, day] = item.date.split('-');
    date.textContent = `Publicado: ${day}/${month}/${year}`;
  } else {
    date.textContent = 'Fecha no disponible';
  }
  const link = element('a', 'read-more', `Leer en ${item.source.label} →`);
  link.href = item.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  body.append(date, link);
  article.append(body);
  return article;
}

function state(type, text, retry = false) {
  const wrapper = element('div', `${type}-state`);
  const icon = element('div', type === 'loading' ? 'loading-spinner' : `${type}-icon`,
    type === 'empty' ? '📭' : type === 'error' ? '⚠️' : '');
  wrapper.append(icon, element('p', '', text));
  if (retry) {
    const button = element('button', 'retry-button', 'Intentar nuevamente');
    button.type = 'button';
    button.addEventListener('click', refreshNews);
    wrapper.append(button);
  }
  grid.replaceChildren(wrapper);
}

function render() {
  const items = [...cache.values()].flat();
  const selected = selectItems(items, {
    query: input.value, category, language: language.value
  });
  if (!items.length && failures.length === sources.length) {
    state('error', 'No se pudieron consultar las fuentes. Probá nuevamente.', true);
  } else if (!selected.length) {
    state('empty', 'No hay artículos para estos filtros entre las entradas disponibles. ' +
      'Probá otra categoría, todos los idiomas o restablecé los filtros.');
  } else {
    grid.replaceChildren(...selected.map(card));
  }
  notice.textContent = `${selected.length} artículos. ` + (failures.length
    ? `No se pudieron actualizar: ${failures.join(', ')}. ` +
      'Se conservan sus resultados anteriores, si los había. Podés reintentar.'
    : 'Fuentes consultadas sin errores.');
}

async function refreshNews() {
  if (loading) return;
  loading = true;
  refresh.disabled = true;
  grid.setAttribute('aria-busy', 'true');
  notice.textContent = 'Consultando las fuentes…';
  if (!cache.size) state('loading', 'Cargando noticias de desarrollo web…');
  try {
    const results = await loadFeeds();
    failures = [];
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        cache.set(source.id, prepareItems(result.value, source, cleanText));
      } else {
        failures.push(source.label);
      }
    });
    updated.textContent = `Última consulta: ${new Date().toLocaleString('es-ES')}. ` +
      'Esta hora no es la fecha de publicación.';
    render();
  } finally {
    loading = false;
    refresh.disabled = false;
    grid.removeAttribute('aria-busy');
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!loading || cache.size) render();
});
input.addEventListener('input', () => {
  if (!loading || cache.size) render();
});
language.addEventListener('change', () => {
  if (!loading || cache.size) render();
});
buttons.forEach(button => button.addEventListener('click', () => {
  category = button.dataset.query;
  buttons.forEach(other => {
    other.classList.toggle('active', other === button);
    other.setAttribute('aria-pressed', String(other === button));
  });
  if (!loading || cache.size) render();
}));
document.getElementById('resetNews').addEventListener('click', () => {
  input.value = '';
  language.value = '';
  buttons[0].click();
});
refresh.addEventListener('click', refreshNews);
input.value = (new URLSearchParams(location.search).get('q') || '').slice(0, 120);
refreshNews();
