const gtmContainerId = 'GTM-MRGDJ643';
const cookieConsentKey = 'miportal-cookie-consent';
let gtmLoaded = false;

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
  if (gtmLoaded || document.querySelector(`script[data-miportal-gtm="${gtmContainerId}"]`)) {
    gtmLoaded = true;
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.dataset.miportalGtm = gtmContainerId;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmContainerId}`;
  document.head.appendChild(script);
  gtmLoaded = true;
};

// Inicializar GTM pero no cargar script hasta consentimiento
initializeGoogleTagManager();

document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const navToggleBtn = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  const getSafeHttpsUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
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
    // Newsletter behavior is loaded only on pages that contain its form.
  };

  const setupProStorage = () => {
    if (document.querySelector('.pro-confirm')) {
      localStorage.setItem('user_is_pro', 'true');
    }
  };

  const setupProMode = () => {
    if (localStorage.getItem('user_is_pro') !== 'true') {
      return;
    }

    document.querySelectorAll('.ad-container, .adsbygoogle').forEach((ad) => {
      ad.hidden = true;
    });

    document.body.classList.add('pro-mode');
  };

  setupProStorage();
  setupProMode();
  setupCookieNotice();
  setupCookiePreferences();
  setupNewsletterForm();

  const setupRecursos = async () => {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    const supabase = window.MiPortalSupabase;

    const renderState = (className, content) => {
      const state = document.createElement('div');
      state.className = className;
      state.append(...content);
      grid.replaceChildren(state);
    };

    const showLoading = () => {
      const wrapper = document.createElement('div');
      wrapper.className = 'loading-spinner';
      const message = document.createElement('p');
      message.textContent = 'Cargando recursos...';
      const state = document.createElement('div');
      state.className = 'loading-state';
      state.append(wrapper, message);
      grid.replaceChildren(state);
      grid.setAttribute('aria-busy', 'true');
    };

    const showEmpty = (message) => {
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '📭';
      const text = document.createElement('p');
      text.textContent = message;
      renderState('empty-state', [icon, text]);
      grid.removeAttribute('aria-busy');
    };

    const showError = (message, withRetry = true) => {
      const icon = document.createElement('div');
      icon.className = 'error-icon';
      icon.textContent = '⚠️';
      const text = document.createElement('p');
      text.textContent = message;
      const state = [];
      if (withRetry) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry-button';
        retry.textContent = 'Intentar nuevamente';
        retry.addEventListener('click', () => setupRecursos());
        state.push(retry);
      }
      renderState('error-state', [icon, text, ...state]);
      grid.removeAttribute('aria-busy');
    };

    const formatDate = (value) => {
      try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {
        return '';
      }
    };

    const createResourceCard = (resource) => {
      const article = document.createElement('article');
      article.className = 'card';

      if (resource.image_url) {
        const image = document.createElement('img');
        image.src = resource.image_url;
        image.alt = `Imagen de ${resource.title || 'recurso'}`;
        image.loading = 'lazy';
        image.onerror = function () {
          this.remove();
        };
        article.appendChild(image);
      }

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = resource.category || 'Recurso';

      const heading = document.createElement('h3');
      heading.textContent = resource.title;

      const description = document.createElement('p');
      description.className = 'card-description';
      description.textContent = resource.description;

      cardBody.append(tag, heading, description);

      const safeUrl = getSafeHttpsUrl(resource.url);
      if (safeUrl) {
        const link = document.createElement('a');
        link.className = 'read-more';
        link.href = safeUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Visitar recurso →';
        cardBody.appendChild(link);
      }

      const updated = formatDate(resource.updated_at || resource.created_at);
      if (updated) {
        const time = document.createElement('time');
        time.className = 'news-date';
        time.textContent = `Actualizado: ${updated}`;
        time.setAttribute('datetime', resource.updated_at || resource.created_at);
        cardBody.appendChild(time);
      }

      article.appendChild(cardBody);
      return article;
    };

    // CONFIG MANUAL: si supabase-config.js quedó con placeholders (faltan las
    // variables SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY en el build), avisamos sin
    // romper.
    if (!supabase) {
      showError('La sección de recursos no está configurada todavía. Completá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Vercel.', false);
      return;
    }

    showLoading();

    try {
      const { data, error } = await supabase
        .from('resources')
        .select('id, title, description, url, category, image_url, created_at, updated_at')
        .eq('published', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        showEmpty('Todavía no hay recursos publicados. Volvé pronto.');
        return;
      }

      const fragment = document.createDocumentFragment();
      data.forEach((resource) => {
        if (!resource || typeof resource.title !== 'string' || typeof resource.url !== 'string') {
          return;
        }
        fragment.appendChild(createResourceCard(resource));
      });

      grid.replaceChildren(fragment);
      grid.removeAttribute('aria-busy');
    } catch (error) {
      showError(`No se pudieron cargar los recursos: ${error.message}. Probá nuevamente en unos segundos.`);
    }
  };

  setupRecursos();

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

});
