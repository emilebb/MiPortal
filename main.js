const gtmContainerId = 'GTM-MRGDJ643';
const cookieConsentKey = 'miportal-cookie-consent';
const rssNewsUrl = 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada';
const rssNewsLabel = 'El País';

// REVISIÓN JURÍDICA: La configuración de consentimiento debe adaptarse según la jurisdicción aplicable
// (ej. RGPD en UE, CCPA en California, etc.) y el tipo de datos procesados.

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

  // Establecer consentimiento por defecto como denegado para no esenciales
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
  
  // Solo cargar GTM si ya hubo consentimiento explícito
  if (savedConsent === 'accepted' || savedConsent === 'rejected') {
    updateGtmConsent(savedConsent === 'accepted');
    loadGtmScript();
  }
};

const loadGtmScript = () => {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmContainerId}`;
  document.head.appendChild(script);
};

// Inicializar GTM pero no cargar script hasta consentimiento
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

  const getSafeHttpsUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const showStatus = (message, type = 'info') => {
    const status = document.createElement('div');
    status.className = `status-message status-${type}`;
    status.textContent = message;
    cardsContainer.replaceChildren(status);
  };

  const showLoading = (message) => {
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.innerHTML = `
      <div class="loading-spinner"></div>
      <p>${message}</p>
    `;
    cardsContainer.replaceChildren(loading);
  };

  const showEmpty = (message) => {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-icon">📭</div>
      <p>${message}</p>
    `;
    cardsContainer.replaceChildren(empty);
  };

  const showError = (message) => {
    const error = document.createElement('div');
    error.className = 'error-state';
    error.innerHTML = `
      <div class="error-icon">⚠️</div>
      <p>${message}</p>
      <button class="retry-button" onclick="location.reload()">Intentar nuevamente</button>
    `;
    cardsContainer.replaceChildren(error);
  };

  const updateLastUpdated = (source) => {
    const lastUpdated = document.getElementById('lastUpdated');
    if (!lastUpdated) return;

    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    lastUpdated.textContent = `Última actualización: ${timeString} (${source})`;
  };

  const setupCookieNotice = () => {
    const savedConsent = localStorage.getItem(cookieConsentKey);
    
    if (savedConsent) {
      // Si ya hay consentimiento, actualizar GTM según la decisión guardada
      if (savedConsent === 'accepted') {
        updateGtmConsent(true);
        loadGtmScript();
      } else {
        updateGtmConsent(false);
      }
      return;
    }

    const notice = document.createElement('aside');
    notice.className = 'cookie-notice';
    notice.setAttribute('aria-label', 'Aviso sobre cookies');
    notice.setAttribute('role', 'dialog');
    notice.innerHTML = `
      <div>
        <h2>Uso de cookies</h2>
        <p>Este sitio utiliza Google Tag Manager para analizar el uso del portal y eventualmente mostrar publicidad. El consentimiento para analítica y publicidad se deniega por defecto y solo se activa si aceptás. Podés cambiar tu decisión en cualquier momento desde el footer.</p>
      </div>
      <div class="cookie-notice-actions">
        <button type="button" class="cookie-reject">Rechazar todo</button>
        <button type="button" class="cookie-accept">Aceptar todo</button>
      </div>`;

    const handleConsent = (value) => {
      localStorage.setItem(cookieConsentKey, value);
      
      if (value === 'accepted') {
        updateGtmConsent(true);
        loadGtmScript();
      } else {
        updateGtmConsent(false);
      }
      
      notice.remove();
    };

    notice.querySelector('.cookie-reject').addEventListener('click', () => handleConsent('rejected'));
    notice.querySelector('.cookie-accept').addEventListener('click', () => handleConsent('accepted'));
    document.body.appendChild(notice);
  };

  const setupCookiePreferences = () => {
    // Buscar o crear enlace de preferencias de cookies en el footer
    const footer = document.querySelector('.main-footer nav');
    if (!footer) return;

    const existingLink = footer.querySelector('.cookie-preferences-link');
    if (existingLink) return;

    const prefLink = document.createElement('a');
    prefLink.href = '#';
    prefLink.className = 'cookie-preferences-link';
    prefLink.textContent = 'Preferencias de cookies';
    prefLink.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem(cookieConsentKey);
      setupCookieNotice();
    });

    footer.appendChild(prefLink);
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
  setupCookiePreferences();
  setupNewsletterForm();

  const loadGoogleNews = async (query) => {
    const normalizedQuery = query.trim().slice(0, maxQueryLength);

    if (!normalizedQuery) {
      showEmpty('Escribí un tema para buscar noticias.');
      return;
    }

    activeController?.abort();

    const controller = new AbortController();
    const requestId = ++currentRequestId;
    activeController = controller;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(normalizedQuery)}&hl=es-419`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;

    showLoading('Buscando en Google News...');

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error('No se pudo conectar con Google News');
      }

      const data = await response.json();
      if (requestId !== currentRequestId || data?.status !== 'ok' || !Array.isArray(data.items)) {
        throw new Error('No se encontraron resultados en Google News');
      }

      const fragment = document.createDocumentFragment();
      let validItems = 0;

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
          link.textContent = 'Leer noticia en Google News →';
          cardBody.appendChild(link);
        }

        article.appendChild(cardBody);
        fragment.appendChild(article);
        validItems++;
      });

      if (requestId !== currentRequestId) {
        return;
      }

      if (validItems === 0) {
        showEmpty(`No se encontraron noticias válidas para "${normalizedQuery}". Probá con otro término.`);
        return;
      }

      cardsContainer.replaceChildren(fragment);
      updateLastUpdated('Google News');
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      if (requestId === currentRequestId) {
        showError(`No se pudieron cargar las noticias de Google News: ${error.message}. Probá nuevamente en unos segundos.`);
      }
    }
  };

  const createNewsCard = ({ tagText, title, description, imageUrl, link, pubDate }) => {
    const article = document.createElement('article');
    article.className = 'card news-card';

    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = `Imagen: ${title || 'noticia'}`;
      image.loading = 'lazy';
      image.onerror = function() {
        this.style.display = 'none';
        article.classList.remove('has-image');
      };
      image.onload = function() {
        article.classList.add('has-image');
      };
      article.appendChild(image);
    }

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = tagText;

    const headline = document.createElement('h3');
    headline.textContent = title;

    const descriptionText = document.createElement('p');
    descriptionText.className = 'card-description';
    descriptionText.textContent = description;

    cardBody.append(tag, headline, descriptionText);

    if (pubDate) {
      const dateElement = document.createElement('time');
      dateElement.className = 'news-date';
      try {
        const date = new Date(pubDate);
        dateElement.textContent = date.toLocaleDateString('es-ES', { 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        });
        dateElement.setAttribute('datetime', pubDate);
        cardBody.appendChild(dateElement);
      } catch (e) {
        // Si la fecha no es válida, no mostrarla
      }
    }

    if (link) {
      const readMore = document.createElement('a');
      readMore.className = 'read-more';
      readMore.href = link;
      readMore.target = '_blank';
      readMore.rel = 'noopener noreferrer';
      readMore.textContent = `Leer noticia en ${tagText} →`;
      cardBody.appendChild(readMore);
    }

    article.appendChild(cardBody);
    return article;
  };

  const cargarNoticiasDirectas = async () => {
    activeController?.abort();

    const controller = new AbortController();
    const requestId = ++currentRequestId;
    activeController = controller;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssNewsUrl)}`;

    showLoading(`Cargando noticias de ${rssNewsLabel}...`);

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error('No se pudo conectar con el feed de El País');
      }

      const data = await response.json();
      if (requestId !== currentRequestId || data?.status !== 'ok' || !Array.isArray(data.items)) {
        throw new Error('No se encontraron noticias en el feed de El País');
      }

      const fragment = document.createDocumentFragment();
      let validItems = 0;

      data.items.slice(0, 12).forEach((item) => {
        if (!item || typeof item.title !== 'string') {
          return;
        }

        const title = cleanDescription(item.title).slice(0, 300);
        const description = cleanDescription(item.description || item.content).slice(0, 600) || 'Lee la noticia completa en su fuente original.';
        const imageUrl = getSafeHttpsUrl(item.thumbnail || (item.enclosure && item.enclosure.link));
        const link = getSafeHttpsUrl(item.link);
        const pubDate = item.pubDate;

        fragment.appendChild(createNewsCard({ tagText: rssNewsLabel, title, description, imageUrl, link, pubDate }));
        validItems++;
      });

      if (requestId !== currentRequestId) {
        return;
      }

      if (validItems === 0) {
        showEmpty('No se encontraron noticias válidas de El País en este momento.');
        return;
      }

      cardsContainer.replaceChildren(fragment);
      updateLastUpdated(rssNewsLabel);
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      if (requestId === currentRequestId) {
        showError(`No se pudieron cargar las noticias de El País: ${error.message}. Probá nuevamente en unos segundos.`);
      }
    }
  };

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    themeToggleBtn.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    });
  }

  if (navToggleBtn && mainNav) {
    navToggleBtn.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      navToggleBtn.setAttribute('aria-expanded', isOpen.toString());
      navToggleBtn.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
      
      if (isOpen) {
        // Mover foco al primer enlace del menú
        const firstLink = mainNav.querySelector('a');
        if (firstLink) {
          setTimeout(() => firstLink.focus(), 100);
        }
      }
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        navToggleBtn.setAttribute('aria-expanded', 'false');
        navToggleBtn.setAttribute('aria-label', 'Abrir menú de navegación');
        navToggleBtn.focus();
      });
    });

    // Cerrar menú con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mainNav.classList.contains('open')) {
        mainNav.classList.remove('open');
        navToggleBtn.setAttribute('aria-expanded', 'false');
        navToggleBtn.setAttribute('aria-label', 'Abrir menú de navegación');
        navToggleBtn.focus();
      }
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
        filterButtons.forEach((filterButton) => {
          filterButton.classList.remove('active');
          filterButton.setAttribute('aria-pressed', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');

        loadGoogleNews(searchInput.value);
      });
    });

    searchInput.value = document.body.dataset.newsQuery || 'noticias';
    cargarNoticiasDirectas();
  }
});