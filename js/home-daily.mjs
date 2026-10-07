import { getSafeDailyUrl, prepareDailyItems } from './home-daily-utils.mjs';

const root = document.getElementById('homeDaily');

if (root) {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const showState = (state, message) => {
    const content = element('div', `daily-state daily-state--${state}`);
    content.setAttribute('role', state === 'error' ? 'alert' : 'status');
    if (state === 'loading') {
      content.setAttribute('aria-busy', 'true');
      content.append(element('span', 'loading-spinner'), element('p', '', message));
    } else {
      content.append(element('p', '', message));
    }
    root.replaceChildren(content);
    root.dataset.state = state;
    root.setAttribute('aria-busy', String(state === 'loading'));
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota'
    }).format(date);
  };

  const addMedia = (card, item, featured) => {
    const media = element('div', 'daily-card-media');
    media.setAttribute('aria-hidden', 'true');
    media.append(element('span', 'daily-image-fallback', 'MP'));

    const imageUrl = getSafeDailyUrl(item.image_url);
    if (imageUrl) {
      const image = element('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        media.classList.remove('has-image');
        image.remove();
      }, { once: true });
      media.classList.add('has-image');
      media.append(image);
    }

    if (featured) media.classList.add('daily-card-media--featured');
    card.append(media);
  };

  const addText = (parent, tag, className, value) => {
    if (typeof value !== 'string' || !value.trim()) return;
    parent.append(element(tag, className, value.trim()));
  };

  const createCard = (item, featured) => {
    const card = element('article', `daily-card${featured ? ' daily-card--featured' : ''}`);
    addMedia(card, item, featured);

    const body = element('div', 'daily-card-body');
    const kicker = element('div', 'daily-card-kicker');
    kicker.append(
      element('span', 'daily-ranking', `#${item.ranking}`),
      element('span', 'daily-category', item.category || 'Tecnología')
    );
    body.append(kicker);

    addText(body, 'h3', 'daily-card-title', item.title);
    addText(body, 'p', 'daily-card-summary', item.summary);

    if (typeof item.why_it_matters === 'string' && item.why_it_matters.trim()) {
      const why = element('div', 'daily-why');
      why.append(element('h4', '', '¿Por qué importa?'));
      why.append(element('p', '', item.why_it_matters.trim()));
      body.append(why);
    }

    const metadata = element('div', 'daily-card-meta');
    if (typeof item.source === 'string' && item.source.trim()) {
      metadata.append(element('span', 'daily-source', item.source.trim()));
    }
    const date = formatDate(item.published_at);
    if (date) metadata.append(element('time', 'daily-date', date));
    if (metadata.childNodes.length) body.append(metadata);

    const url = getSafeDailyUrl(item.url);
    if (url) {
      const link = element('a', 'daily-source-link', 'Leer fuente original');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(element('span', '', ' →'));
      body.append(link);
    }

    card.append(body);
    return card;
  };

  const renderDaily = (daily) => {
    const items = prepareDailyItems(daily?.items);
    if (!items.length) {
      showState('empty', 'Todavía no hay un MiPortal Daily disponible. Volvé pronto.');
      return;
    }

    const featured = createCard(items[0], true);
    const content = element('div', 'daily-content');
    content.append(featured);

    if (items.length > 1) {
      const list = element('div', 'daily-more');
      items.slice(1).forEach((item) => list.append(createCard(item, false)));
      content.append(list);
    }

    root.replaceChildren(content);
    root.dataset.state = 'loaded';
    root.removeAttribute('aria-busy');
  };

  const loadDaily = async () => {
    showState('loading', 'Cargando el Daily más reciente…');
    const supabase = window.MiPortalSupabase;

    if (!supabase) {
      showState('error', 'MiPortal Daily no está disponible temporalmente.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('miportal_daily')
        .select('daily_date, items')
        .order('daily_date', { ascending: false })
        .limit(1);

      if (error) throw error;
      renderDaily(Array.isArray(data) ? data[0] : null);
    } catch {
      showState('error', 'No pudimos cargar MiPortal Daily. Probá nuevamente más tarde.');
    }
  };

  loadDaily();
}
