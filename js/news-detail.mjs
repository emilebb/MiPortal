import { isNewsId, safeNewsUrl, newsDetailUrl, absoluteNewsDetailUrl, relatedNews } from './news-detail-utils.mjs';
import { isImageWidthSufficient } from './image-utils.mjs';

const $ = (id) => document.getElementById(id);
const status = $('articleStatus');
const articleRoot = $('newsArticle');
const relatedRoot = $('relatedNews');
const relatedSection = $('relatedSection');
const fallbackImage = 'og-image.svg';
const breadcrumbTitle = $('breadcrumbTitle');

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function setMeta(selector, value) {
  const meta = document.querySelector(selector);
  if (meta) meta.setAttribute('content', value);
}

function showState(message, kind = 'loading') {
  status.className = `article-state article-state--${kind}`;
  status.replaceChildren(document.createTextNode(message));
  if (kind === 'error' || kind === 'not-found') {
    const links = node('p', 'article-state-links');
    const news = node('a', '', 'Noticias');
    news.href = 'noticias.html';
    const home = node('a', '', 'Inicio');
    home.href = 'index.html';
    links.append(news, document.createTextNode(' · '), home);
    status.append(links);
  }
}

function publishedDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function renderRelated(items) {
  if (!items.length) return;
  relatedSection.hidden = false;
  for (const item of items) {
    const link = node('a', 'related-news-card');
    link.href = newsDetailUrl(item.id);
    const image = document.createElement('img');
    const imageUrl = safeNewsUrl(item.image_url);
    image.src = imageUrl || fallbackImage;
    image.alt = '';
    image.loading = 'lazy';
    if (imageUrl) {
      image.addEventListener('load', () => {
        if (!isImageWidthSufficient(image.naturalWidth)) image.src = fallbackImage;
      }, { once: true });
    }
    image.addEventListener('error', () => { image.src = fallbackImage; }, { once: true });
    const date = publishedDate(item.published_at);
    const dateNode = node('time', 'news-detail-date', date
      ? new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(date)
      : 'Fecha no disponible');
    if (date) dateNode.dateTime = date.toISOString();
    link.append(image, node('h3', '', item.title), node('span', 'eyebrow', item.source || 'Fuente'), dateNode);
    relatedRoot.append(link);
  }
}

function renderArticle(row) {
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!title) throw new Error('incomplete');
  const originalUrl = safeNewsUrl(row.url);
  const date = publishedDate(row.published_at);
  const source = typeof row.source === 'string' && row.source.trim() ? row.source.trim() : 'Fuente';

  document.title = `${title} | MiPortal`;
  breadcrumbTitle.textContent = title;
  const description = typeof row.description === 'string' && row.description.trim()
    ? row.description.trim().slice(0, 300) : `Lee esta noticia de ${source} en MiPortal.`;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', document.title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', location.href);
  setMeta('meta[name="twitter:title"]', document.title);
  setMeta('meta[name="twitter:description"]', description);
  const imageUrl = safeNewsUrl(row.image_url) || new URL(fallbackImage, location.href).href;
  setMeta('meta[property="og:image"]', imageUrl);
  setMeta('meta[name="twitter:image"]', imageUrl);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = location.href;

  const content = document.createElement('article');
  content.className = 'news-detail-article';
  const header = node('header', 'news-detail-header');
  header.append(node('span', 'eyebrow', source), node('h1', '', title));
  if (date) {
    const time = node('time', 'news-detail-date', new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(date));
    time.dateTime = date.toISOString();
    header.append(time);
  }
  content.append(header);

  const image = document.createElement('img');
  image.className = `news-detail-image${safeNewsUrl(row.image_url) ? '' : ' news-detail-image--fallback'}`;
  image.src = imageUrl;
  image.alt = '';
  image.loading = 'eager';
  if (safeNewsUrl(row.image_url)) {
    image.addEventListener('load', () => {
      if (!isImageWidthSufficient(image.naturalWidth)) {
        image.classList.add('news-detail-image--fallback');
        image.src = fallbackImage;
      }
    }, { once: true });
  }
  image.addEventListener('error', () => {
    image.classList.add('news-detail-image--fallback');
    image.src = fallbackImage;
  }, { once: true });
  content.append(image);

  if (typeof row.description === 'string' && row.description.trim()) {
    content.append(node('p', 'news-detail-description', row.description.trim()));
  }
  const disclosure = node('p', 'news-detail-disclosure', 'MiPortal resume y agrega noticias; el editor o medio enlazado es la fuente original de esta información.');
  content.append(disclosure);
  const actions = node('div', 'news-detail-actions');
  if (originalUrl) {
    const original = node('a', 'btn btn-primary', 'Leer fuente original ↗');
    original.href = originalUrl;
    original.target = '_blank';
    original.rel = 'noopener noreferrer';
    actions.append(original);
  }
  const copy = node('button', 'btn btn-secondary', 'Copiar enlace');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      const detailUrl = absoluteNewsDetailUrl(row.id, location.href);
      if (!detailUrl) throw new Error('invalid detail URL');
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(detailUrl);
      else throw new Error('clipboard unavailable');
    } catch {
      const input = document.createElement('textarea');
      input.value = absoluteNewsDetailUrl(row.id, location.href);
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) { copy.textContent = 'No se pudo copiar'; return; }
    }
    copy.textContent = 'Enlace copiado';
  });
  actions.append(copy);
  content.append(actions);
  articleRoot.replaceChildren(content);
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  if (!isNewsId(id)) {
    showState('Noticia no encontrada', 'not-found');
    return;
  }
  if (!window.MiPortalSupabase) {
    showState('No pudimos cargar la noticia. Vuelve a intentarlo más tarde.', 'error');
    return;
  }
  showState('Cargando noticia…');
  try {
    const { data, error } = await window.MiPortalSupabase.from('news_articles')
      .select('id,url,title,description,image_url,source,published_at,published')
      .eq('published', true).eq('id', id).limit(1);
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) { showState('Noticia no encontrada', 'not-found'); return; }
    renderArticle(row);
    status.remove();
    const related = await window.MiPortalSupabase.from('news_articles')
      .select('id,title,source,image_url,published,published_at')
      .eq('published', true).neq('id', id).order('published_at', { ascending: false }).limit(3);
    if (!related.error) renderRelated(relatedNews(related.data, id));
  } catch (error) {
    console.error('[news-detail] Error al cargar la noticia:', error);
    showState('No pudimos cargar la noticia. Vuelve a intentarlo más tarde.', 'error');
  }
}

load();
