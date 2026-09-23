import {
  prepareItems,
  selectItems,
  loadNews
} from './news-feed.mjs';

const grid = document.getElementById('cardsContainer');
const form = document.getElementById('searchForm');
const input = document.getElementById('searchInput');
const language = document.getElementById('newsLanguage');
const refresh = document.getElementById('refreshNews');
const notice = document.getElementById('newsStatus');
const updated = document.getElementById('lastUpdated');
const buttons = document.querySelectorAll('.filter-btn[data-query]');

let items = [];
let category = '';
let loading = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;

  if (text) {
    node.textContent = text;
  }

  return node;
}

function card(item) {
  const article = element(
    'article',
    'card news-card'
  );

  const body = element(
    'div',
    'card-body'
  );

  const languageLabel =
    item.source.language === 'es'
      ? 'Español'
      : 'Inglés';

  body.append(
    element(
      'span',
      'tag',
      `${item.source.label} · ${languageLabel}`
    )
  );

  const title = element(
    'h3',
    '',
    item.title
  );

  const description = element(
    'p',
    'card-description',
    item.description ||
      'Leé el artículo completo en su fuente original.'
  );

  title.lang = item.source.language;
  description.lang = item.source.language;

  body.append(
    title,
    description
  );

  const date = element(
    item.date ? 'time' : 'span',
    'news-date'
  );

  if (item.date) {
    date.dateTime = item.date;

    const [year, month, day] =
      item.date.split('-');

    date.textContent =
      `Publicado: ${day}/${month}/${year}`;
  } else {
    date.textContent =
      'Fecha no disponible';
  }

  const link = element(
    'a',
    'read-more',
    `Leer en ${item.source.label} →`
  );

  link.href = item.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  body.append(
    date,
    link
  );

  article.append(body);

  return article;
}

function state(
  type,
  text,
  retry = false
) {
  const wrapper = element(
    'div',
    `${type}-state`
  );

  const icon = element(
    'div',
    type === 'loading'
      ? 'loading-spinner'
      : `${type}-icon`,
    type === 'empty'
      ? '📭'
      : type === 'error'
        ? '⚠️'
        : ''
  );

  wrapper.append(
    icon,
    element('p', '', text)
  );

  if (retry) {
    const button = element(
      'button',
      'retry-button',
      'Intentar nuevamente'
    );

    button.type = 'button';

    button.addEventListener(
      'click',
      refreshNews
    );

    wrapper.append(button);
  }

  grid.replaceChildren(wrapper);
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

  if (!items.length) {
    state(
      'empty',
      'Todavía no hay noticias publicadas.'
    );
  } else if (!selected.length) {
    state(
      'empty',
      'No hay artículos para estos filtros. Probá otra categoría, otro idioma o restablecé los filtros.'
    );
  } else {
    grid.replaceChildren(
      ...selected.map(card)
    );
  }

  notice.textContent =
    `${selected.length} artículos disponibles.`;
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

  notice.textContent =
    'Consultando noticias…';

  if (!items.length) {
    state(
      'loading',
      'Cargando noticias de desarrollo web…'
    );
  }

  try {
    const rows = await loadNews();

    items = prepareItems(rows);

    updated.textContent =
      `Última consulta: ${
        new Date().toLocaleString(
          'es-CO'
        )
      }.`;

    render();
  } catch (error) {
    console.error(
      '[news] Error al cargar noticias:',
      error
    );

    notice.textContent =
      'No se pudieron cargar las noticias.';

    state(
      'error',
      'No se pudieron consultar las noticias. Probá nuevamente.',
      true
    );
  } finally {
    loading = false;
    refresh.disabled = false;

    grid.removeAttribute(
      'aria-busy'
    );
  }
}

form.addEventListener(
  'submit',
  event => {
    event.preventDefault();
    render();
  }
);

input.addEventListener(
  'input',
  () => {
    render();
  }
);

language.addEventListener(
  'change',
  () => {
    render();
  }
);

buttons.forEach(
  button =>
    button.addEventListener(
      'click',
      () => {
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

document
  .getElementById('resetNews')
  .addEventListener(
    'click',
    () => {
      input.value = '';
      language.value = '';

      if (buttons.length) {
        buttons[0].click();
      } else {
        category = '';
        render();
      }
    }
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