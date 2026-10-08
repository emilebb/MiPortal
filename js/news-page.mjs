/* ============================================================================
   MiPortal — página de Noticias
   ----------------------------------------------------------------------------
   Renderiza el listado de noticias de `news_articles` (Supabase) usando el
   módulo de datos compartido js/news-feed.mjs: la consulta, la detección de
   idioma, la clasificación por temas y la deduplicación no cambian. Aquí solo
   se cambia la presentación (tarjetas, esqueletos, estados y cabecera).

   Contrato con styles.css y con el resto del sitio:
     · ids  — #cardsContainer, #searchForm, #searchInput, #newsLanguage,
              #resetNews, #refreshNews, #newsStatus, #newsCount, #newsWarning,
              #lastUpdated
     · CSS  — .card .news-card, .card-media, .card-body, .card-title,
              .card-description, .card-meta, .card-link, .skeleton-card,
              .empty-state, .error-state, .retry-button, .news-clear
   ========================================================================== */
import {
  prepareItems,
  selectItems,
  loadNews
} from './news-feed.mjs';
import { newsDetailUrl } from './news-detail-utils.mjs';
import { paginateItems, relativeDateLabel } from './news-page-utils.mjs';
import { createNewsCardMedia } from './news-page-media.mjs';

const grid = document.getElementById('cardsContainer');
const form = document.getElementById('searchForm');
const input = document.getElementById('searchInput');
const language = document.getElementById('newsLanguage');
const refresh = document.getElementById('refreshNews');
const notice = document.getElementById('newsStatus');
const counter = document.getElementById('newsCount');
const warning = document.getElementById('newsWarning');
const reset = document.getElementById('resetNews');
const updated = document.getElementById('lastUpdated');
const buttons = document.querySelectorAll('.filter-btn[data-query]');

/* Etiquetas legibles de las categorías que news-feed.mjs detecta. El orden
   coincide con el de las píldoras de la página. */
const CATEGORY_LABELS = {
  css: 'CSS',
  javascript: 'JavaScript',
  frameworks: 'Frameworks',
  platform: 'HTML',
  accessibility: 'Accesibilidad'
};

const CATEGORY_ORDER = [
  'css',
  'javascript',
  'frameworks',
  'platform',
  'accessibility'
];

const SKELETON_COUNT = 6;

let items = [];
let category = '';
let loading = false;
let currentPage = 1;
const PAGE_SIZE = 12;
const pagination = document.createElement('nav');
pagination.className = 'news-pagination';
pagination.setAttribute('aria-label', 'Paginación de noticias');
grid.insertAdjacentElement('afterend', pagination);

function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text) {
    node.textContent = text;
  }

  return node;
}

/* --- Presentación de datos ---------------------------------------------- */

function categoryLabel(item) {
  const found = CATEGORY_ORDER.find(key =>
    item.categories.includes(key)
  );

  return found ? CATEGORY_LABELS[found] : 'Web';
}

/* Fechas sin zona horaria: publicationDate() ya entrega "YYYY-MM-DD", así que
   se formatea desde las partes para no desplazar el día según el navegador. */
const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sept', 'oct', 'nov', 'dic'
];

function formatDate(value) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    value || ''
  );

  if (!parts) {
    return null;
  }

  const [, year, month, day] = parts;

  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/* Marca la fecha completa para lectores de pantalla; el texto visible es la
   fecha corta. */
function dateNode(item) {
  if (!item.date) {
    return null;
  }

  const absolute = formatDate(item.date);
  const relative = relativeDateLabel(item.date);
  const node = element(
    'time',
    'card-date',
    absolute || ''
  );

  node.dateTime = item.date;

  if (absolute && relative) {
    node.setAttribute(
      'aria-label',
      `Publicado el ${absolute} (${relative})`
    );

    node.title = absolute;
  }

  return node;
}

/* --- Tarjeta ------------------------------------------------------------- */

function card(item) {
  const article = element(
    'article',
    'card news-card'
  );

  const body = element(
    'div',
    'card-body'
  );

  const kicker = element(
    'p',
    'card-kicker'
  );

  kicker.append(
    element(
      'span',
      'card-tag',
      categoryLabel(item)
    ),
    element(
      'span',
      'card-source-label',
      item.source.label
    )
  );

  const title = element('h3', 'card-title');
  const titleLink = element('a', null, item.title);
  titleLink.href = newsDetailUrl(item.id) || item.link;
  if (!newsDetailUrl(item.id)) {
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
  }
  title.append(titleLink);

  title.lang = item.source.language;

  const description = element(
    'p',
    'card-description',
    item.description ||
      'Lee el artículo completo en su fuente original.'
  );

  description.lang = item.description
    ? item.source.language
    : 'es';

  const meta = element(
    'p',
    'card-meta'
  );

  const date = dateNode(item);

  if (date) {
    meta.append(date);
  }

  body.append(
    kicker,
    title,
    description,
    meta
  );

  /* Enlace principal de la tarjeta. El texto visible ya es corto; el
     complementary label indica la fuente y la apertura en otra pestaña. */
  const link = element(
    'a',
    'read-more card-link'
  );

  link.href = newsDetailUrl(item.id) || item.link;
  if (!newsDetailUrl(item.id)) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  link.append(
    element('span', null, 'Leer noticia'),
    element(
      'span',
      'card-link-arrow',
      '→'
    ),
    element(
      'span',
      'visually-hidden',
      ` en ${item.source.label} (se abre en una pestaña nueva)`
    )
  );

  body.append(link);
  article.append(createNewsCardMedia(item), body);

  return article;
}

/* --- Estados ------------------------------------------------------------- */

function skeleton() {
  const article = element(
    'article',
    'card news-card skeleton-card'
  );

  const body = element(
    'div',
    'card-body'
  );

  ['skeleton-line skeleton-tag', 'skeleton-line skeleton-title',
    'skeleton-line skeleton-text', 'skeleton-line skeleton-text skeleton-text--short',
    'skeleton-line skeleton-meta'
  ].forEach(className => {
    body.append(
      element('div', className)
    );
  });

  article.setAttribute(
    'aria-hidden',
    'true'
  );

  article.append(
    element('div', 'card-media'),
    body
  );

  return article;
}

function skeletons() {
  return Array.from(
    { length: SKELETON_COUNT },
    skeleton
  );
}

function state(
  type,
  heading,
  text,
  action
) {
  const wrapper = element(
    'div',
    `${type}-state`
  );

  wrapper.append(
    element(
      'div',
      type === 'empty'
        ? 'empty-icon'
        : `${type}-icon`,
      type === 'empty'
        ? ''
        : ''
    ),
    element('h3', '', heading)
  );

  if (text) {
    wrapper.append(
      element('p', '', text)
    );
  }

  if (action) {
    const button = element(
      'button',
      action === 'retry'
        ? 'btn btn-primary retry-button'
        : 'btn btn-secondary',
      action === 'retry'
        ? 'Intentar nuevamente'
        : 'Limpiar filtros'
    );

    button.type = 'button';
    button.addEventListener(
      'click',
      action === 'retry'
        ? refreshNews
        : clearFilters
    );

    wrapper.append(button);
  }

  grid.replaceChildren(wrapper);
}

/* --- Encabezado del listado --------------------------------------------- */

function updateTools() {
  const hasFilters =
    input.value.trim() !== '' ||
    category !== '' ||
    language.value !== '';

  /* "Limpiar filtros" solo existe cuando hay algo que limpiar. */
  reset.hidden = !hasFilters;
}

function setCount(value) {
  counter.textContent =
    `${value} noticia${value === 1 ? '' : 's'}`;
}

function render() {
  const selected = selectItems(
    items,
    {
      query: input.value,
      category,
      language: language.value
    }
  );
  const page = paginateItems(selected, currentPage, PAGE_SIZE);
  currentPage = page.page;

  notice.textContent = '';

  if (!items.length) {
    state(
      'empty',
      'Todavía no hay noticias',
      'Aún no publicamos artículos. Vuelve en un rato para ver las novedades.'
    );

    counter.textContent = '';
  } else if (!selected.length) {
    const query = input.value.trim();

    state(
      'empty',
      'No encontramos noticias',
      query
        ? `No hay resultados para «${query}». Prueba con otra búsqueda o quita los filtros.`
        : 'No hay artículos para estos filtros. Prueba con otra categoría o con otro idioma.',
      'clear'
    );

    counter.textContent = '0 noticias';
  } else {
    grid.replaceChildren(...page.items.map(card));

    setCount(selected.length);
  }

  renderPagination(page);

  updateTools();
}

function renderPagination(page) {
  pagination.replaceChildren();
  if (page.pageCount < 2) return;
  const previous = element('button', 'btn btn-secondary btn-sm', 'Anterior');
  previous.type = 'button';
  previous.disabled = page.page === 1;
  previous.setAttribute('aria-controls', 'cardsContainer');
  previous.addEventListener('click', () => navigatePage(currentPage - 1));
  const status = element('span', 'news-page-status', `Página ${page.page} de ${page.pageCount}`);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const next = element('button', 'btn btn-secondary btn-sm', 'Siguiente');
  next.type = 'button';
  next.disabled = page.page === page.pageCount;
  next.setAttribute('aria-controls', 'cardsContainer');
  next.addEventListener('click', () => navigatePage(currentPage + 1));
  pagination.append(previous, status, next);
}

function navigatePage(page) {
  currentPage = page;
  render();
  const firstLink = grid.querySelector('.card-title a');
  if (!firstLink) return;
  firstLink.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  grid.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

/* --- Acciones ------------------------------------------------------------ */

function clearFilters() {
  input.value = '';
  language.value = '';

  if (buttons.length) {
    buttons[0].click();
  } else {
    category = '';
    render();
  }
}

async function refreshNews() {
  if (loading) {
    return;
  }

  loading = true;
  refresh.disabled = true;

  grid.setAttribute(
    'aria-busy',
    'true'
  );

  notice.textContent = 'Cargando noticias…';
  counter.textContent = '';

  if (!items.length) {
    grid.replaceChildren(...skeletons());
  }

  try {
    const rows = await loadNews();

    items = prepareItems(rows);

    updated.textContent =
      `Última consulta: ${
        new Date().toLocaleString(
          'es-ES'
        )
      }.`;

    warning.hidden = true;
    render();
  } catch (error) {
    console.error(
      '[news] Error al cargar noticias:',
      error
    );

    if (items.length) {
      /* Fallo puntual: se conserva el listado ya disponible. */
      warning.hidden = false;
      warning.textContent =
        'No pudimos actualizar algunas fuentes. Se muestran las noticias disponibles.';

      notice.textContent = '';
      setCount(items.length);
      updateTools();
    } else {
      state(
        'error',
        'No pudimos cargar las noticias',
        'Vuelve a intentarlo en unos segundos.',
        'retry'
      );

      notice.textContent = '';
      counter.textContent = '';
    }
  } finally {
    loading = false;
    refresh.disabled = false;

    grid.removeAttribute(
      'aria-busy'
    );
  }
}

/* --- Enlaces de la página ------------------------------------------------ */

form.addEventListener(
  'submit',
  event => {
    event.preventDefault();
    currentPage = 1;
    render();
  }
);

input.addEventListener(
  'input',
  () => {
    currentPage = 1;
    render();
  }
);

language.addEventListener(
  'change',
  () => {
    currentPage = 1;
    render();
  }
);

buttons.forEach(
  button =>
    button.addEventListener(
      'click',
      () => {
        currentPage = 1;
        category =
          button.dataset.query || '';

        buttons.forEach(other => {
          const active =
            other === button;

          other.classList.toggle(
            'active',
            active
          );

          other.setAttribute(
            'aria-pressed',
            String(active)
          );
        });

        render();
      }
    )
);

reset.addEventListener(
  'click',
  clearFilters
);

refresh.addEventListener(
  'click',
  refreshNews
);

input.value = (
  new URLSearchParams(
    location.search
  ).get('q') || ''
).slice(0, 120);

refreshNews();
