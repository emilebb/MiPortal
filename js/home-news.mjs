/* ============================================================================
   MiPortal — "Últimas noticias" de la portada
   ----------------------------------------------------------------------------
   Reutiliza el mismo módulo de datos que noticias.html (js/news-feed.mjs) para
   leer de `news_articles` en Supabase. No inventa contenido: si la base no está
   disponible, no hay noticias o la consulta falla, se muestra un estado con un
   enlace a /noticias.html.

   Reutiliza las mismas clases que news-page.mjs y main.js ya usan en el resto
   del sitio: card, news-card, card-body, tag, card-description, news-date,
   read-more, loading-state, empty-state, error-state, retry-button.
   ========================================================================== */
import {
  loadNews,
  prepareItems,
  selectItems
} from './news-feed.mjs';
import { newsDetailUrl } from './news-detail-utils.mjs';

const grid = document.getElementById('homeNewsGrid');

if (grid) {
  const MAX_ITEMS = 6;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text) node.textContent = text;

    return node;
  };

  const languageLabel = (item) =>
    item.source.language === 'es' ? 'Español' : 'Inglés';

  const formatDate = (value) => {
    if (!value) return 'Fecha no disponible';

    const [year, month, day] = String(value).split('-');

    if (!year || !month || !day) return 'Fecha no disponible';

    return `${day}/${month}/${year}`;
  };

  const card = (item) => {
    const article = element('article', 'card news-card');
    const body = element('div', 'card-body');

    body.append(
      element('span', 'tag', `${item.source.label} · ${languageLabel(item)}`)
    );

    const title = element('h3');
    const titleLink = element('a', '', item.title);
    titleLink.href = newsDetailUrl(item.id) || item.link;
    if (!newsDetailUrl(item.id)) {
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
    }
    titleLink.lang = item.source.language;
    title.append(titleLink);
    body.append(title);

    const description = element(
      'p',
      'card-description',
      item.description || 'Lee el artículo completo en su fuente original.'
    );
    description.lang = item.source.language;
    body.append(description);

    const date = element(item.date ? 'time' : 'span', 'news-date');

    if (item.date) {
      date.dateTime = item.date;
    }

    date.textContent = `Publicado: ${formatDate(item.date)}`;
    body.append(date);

    const link = element('a', 'read-more', 'Leer noticia →');
    link.href = newsDetailUrl(item.id) || item.link;
    if (!newsDetailUrl(item.id)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    body.append(link);

    article.append(body);

    return article;
  };

  const stateBlock = (message, options = {}) => {
    const { icon, retry = false } = options;
    const wrapper = element('div', 'home-news-note');

    if (icon) wrapper.append(element('span', '', icon));

    wrapper.append(element('p', '', message));

    const link = element('a', 'link-arrow', 'Ver todas las noticias →');
    link.href = 'noticias.html';
    wrapper.append(link);

    if (retry) {
      const button = element('button', 'btn btn-secondary btn-sm', 'Reintentar');
      button.type = 'button';
      button.addEventListener('click', render);
      wrapper.append(button);
    }

    return wrapper;
  };

  const show = (node, state) => {
    grid.dataset.state = state;
    grid.replaceChildren(node);
    grid.removeAttribute('aria-busy');
  };

  function render() {
    grid.dataset.state = 'loading';
    grid.setAttribute('aria-busy', 'true');

    const loading = element('div', 'loading-state');
    loading.append(element('div', 'loading-spinner'), element('p', '', 'Cargando noticias…'));
    grid.replaceChildren(loading);

    loadNews({ limit: 12 })
      .then((rows) => {
        const items = selectItems(prepareItems(rows)).slice(0, MAX_ITEMS);

        if (!items.length) {
          show(
            stateBlock('Todavía no hay noticias publicadas. Vuelve pronto.', { icon: '📭' }),
            'empty'
          );
          return;
        }

        const fragment = document.createDocumentFragment();

        items.forEach((item) => fragment.append(card(item)));

        show(fragment, 'loaded');
      })
      .catch(() => {
        show(
          stateBlock('No pudimos cargar las novedades. Vuelve a intentarlo en unos segundos.', {
            icon: '⚠️',
            retry: true
          }),
          'error'
        );
      });
  }

  render();
}
