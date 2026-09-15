document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const navToggleBtn = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const cardsContainer = document.getElementById('cardsContainer');
  const filterButtons = document.querySelectorAll('.filter-btn');

  const cleanDescription = (html) => {
    const descriptionDocument = new DOMParser().parseFromString(html || '', 'text/html');
    descriptionDocument.querySelectorAll('script, style, ol, ul').forEach((element) => element.remove());

    return (descriptionDocument.body.textContent || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const loadGoogleNews = async (query) => {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;

    cardsContainer.innerHTML = '<p class="google-results">Cargando noticias...</p>';

    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error('No se pudo consultar Google News');
      }

      const data = await response.json();
      if (data.status !== 'ok' || !data.items?.length) {
        throw new Error('No se encontraron noticias');
      }

      cardsContainer.innerHTML = '';
      data.items.slice(0, 12).forEach((item) => {
        const article = document.createElement('article');
        article.className = 'card news-card';

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';

        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Google News';

        const title = document.createElement('h3');
        title.textContent = item.title;

        const description = document.createElement('p');
        description.className = 'card-description';
        description.textContent = cleanDescription(item.description) || 'Lee la noticia completa en su fuente original.';

        const link = document.createElement('a');
        link.className = 'read-more';
        link.href = item.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Leer noticia →';

        cardBody.append(tag, title, description, link);
        article.appendChild(cardBody);
        cardsContainer.appendChild(article);
      });
    } catch (error) {
      cardsContainer.innerHTML = '<p class="google-results">No se pudieron cargar las noticias ahora. Probá nuevamente en unos segundos.</p>';
    }
  };

  // 1. Funcionalidad de Modo Oscuro
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  });

  // 2. Menú Desplegable Móvil
  navToggleBtn.addEventListener('click', () => {
    mainNav.classList.toggle('open');
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadGoogleNews(searchInput.value.trim());
  });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      searchInput.value = button.dataset.query;
      filterButtons.forEach((filterButton) => filterButton.classList.remove('active'));
      button.classList.add('active');

      searchInput.value = searchInput.value || 'noticias';
      loadGoogleNews(searchInput.value);
    });
  });

  searchInput.value = 'noticias';
  loadGoogleNews(searchInput.value);
});