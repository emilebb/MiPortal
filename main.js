const gtmContainerId = 'GTM-MRGDJ643';
const cookieConsentKey = 'miportal-cookie-consent';

const updateGtmConsent = (hasConsent) => {
  if (typeof window.gtag !== 'function') {
    return;
  }

  window.gtag('consent', 'update', {
    ad_storage: hasConsent ? 'granted' : 'denied',
    analytics_storage: hasConsent ? 'granted' : 'denied',
    ad_user_data: hasConsent ? 'granted' : 'denied',
    ad_personalization: hasConsent ? 'granted' : 'denied'
  });
};

const initializeGoogleTagManager = () => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  const savedConsent = window.localStorage.getItem(cookieConsentKey);
  updateGtmConsent(savedConsent === 'accepted');

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmContainerId}`;
  document.head.appendChild(script);
};

initializeGoogleTagManager();

document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const navToggleBtn = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const cardsContainer = document.getElementById('cardsContainer');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const maxQueryLength = 120;
  let activeController = null;
  let currentRequestId = 0;

  const cleanDescription = (html) => {
    const descriptionDocument = new DOMParser().parseFromString(html || '', 'text/html');
    descriptionDocument.querySelectorAll('script, style, ol, ul').forEach((element) => element.remove());

    let text = descriptionDocument.body.textContent || '';

    if (/<\/?(?:ol|ul|li|a|p|br)\b/i.test(text)) {
      const encodedMarkupDocument = new DOMParser().parseFromString(text, 'text/html');
      encodedMarkupDocument.querySelectorAll('script, style, ol, ul').forEach((element) => element.remove());
      text = encodedMarkupDocument.body.textContent || '';
    }

    return text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getSafeNewsUrl = (value) => {
    try {
      const url = new URL(value);

      if (url.protocol !== 'https:' || url.hostname !== 'news.google.com') {
        return null;
      }

      return url.href;
    } catch {
      return null;
    }
  };

  const showStatus = (message) => {
    const status = document.createElement('p');
    status.className = 'google-results';
    status.textContent = message;
    cardsContainer.replaceChildren(status);
  };

  const setupCookieNotice = () => {
    if (localStorage.getItem(cookieConsentKey)) {
      return;
    }

    const notice = document.createElement('aside');
    notice.className = 'cookie-notice';
    notice.setAttribute('aria-label', 'Aviso sobre cookies');
    notice.innerHTML = `
      <div>
        <h2>Uso de cookies</h2>
        <p>Este sitio puede utilizar cookies para analizar el uso del portal y mostrar publicidad. No cargamos servicios de analítica o publicidad de terceros desde este sitio.</p>
      </div>
      <div class="cookie-notice-actions">
        <button type="button" class="cookie-dismiss">Cerrar</button>
        <button type="button" class="cookie-accept">Aceptar</button>
      </div>`;

    const closeNotice = (value) => {
      localStorage.setItem(cookieConsentKey, value);
      updateGtmConsent(value === 'accepted');
      notice.remove();
    };

    notice.querySelector('.cookie-dismiss').addEventListener('click', () => closeNotice('dismissed'));
    notice.querySelector('.cookie-accept').addEventListener('click', () => closeNotice('accepted'));
    document.body.appendChild(notice);
  };

  const setupNewsletterForm = () => {
    const newsletterForm = document.getElementById('newsletterForm');
    const newsletterStatus = document.getElementById('newsletterStatus');

    if (!newsletterForm || !newsletterStatus) {
      return;
    }

    newsletterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      newsletterStatus.textContent = 'La suscripción todavía no está conectada a un backend.';
      newsletterStatus.classList.add('is-visible');
    });
  };

  setupCookieNotice();
  setupNewsletterForm();

  const loadGoogleNews = async (query) => {
    const normalizedQuery = query.trim().slice(0, maxQueryLength);

    if (!normalizedQuery) {
      showStatus('Escribí un tema para buscar noticias.');
      return;
    }

    activeController?.abort();

    const controller = new AbortController();
    const requestId = ++currentRequestId;
    activeController = controller;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(normalizedQuery)}&hl=es-419`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;

    showStatus('Cargando noticias...');

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error('No se pudo consultar Google News');
      }

      const data = await response.json();
      if (requestId !== currentRequestId || data?.status !== 'ok' || !Array.isArray(data.items)) {
        throw new Error('No se encontraron noticias');
      }

      const fragment = document.createDocumentFragment();
      data.items.slice(0, 12).forEach((item) => {
        if (!item || typeof item.title !== 'string') {
          return;
        }

        const article = document.createElement('article');
        article.className = 'card news-card';

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';

        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Google News';

        const title = document.createElement('h3');
        title.textContent = item.title.slice(0, 300);

        const description = document.createElement('p');
        description.className = 'card-description';
        description.textContent = cleanDescription(item.description).slice(0, 600) || 'Lee la noticia completa en su fuente original.';

        cardBody.append(tag, title, description);

        const safeUrl = getSafeNewsUrl(item.link);
        if (safeUrl) {
          const link = document.createElement('a');
          link.className = 'read-more';
          link.href = safeUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Leer noticia →';
          cardBody.appendChild(link);
        }

        article.appendChild(cardBody);
        fragment.appendChild(article);
      });

      if (requestId !== currentRequestId) {
        return;
      }

      cardsContainer.replaceChildren(fragment);
      if (!cardsContainer.children.length) {
        showStatus('No se encontraron noticias válidas.');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      if (requestId === currentRequestId) {
        showStatus('No se pudieron cargar las noticias ahora. Probá nuevamente en unos segundos.');
      }
    }
  };

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    });
  }

  if (navToggleBtn && mainNav) {
    navToggleBtn.addEventListener('click', () => {
      mainNav.classList.toggle('open');
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => mainNav.classList.remove('open'));
    });
  }

  if (cardsContainer && searchForm && searchInput) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      loadGoogleNews(searchInput.value.trim());
    });

    filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        searchInput.value = button.dataset.query || 'noticias';
        filterButtons.forEach((filterButton) => filterButton.classList.remove('active'));
        button.classList.add('active');

        loadGoogleNews(searchInput.value);
      });
    });

    searchInput.value = document.body.dataset.newsQuery || 'noticias';
    loadGoogleNews(searchInput.value);
  }
});