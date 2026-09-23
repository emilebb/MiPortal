import test from 'node:test';
import assert from 'node:assert/strict';

import {
  publicationDate,
  classify,
  detectLanguage,
  prepareItems,
  selectItems,
  loadNews
} from '../js/news-feed.mjs';

// Node no tiene DOMParser.
// Este DOMParser mínimo es suficiente para los textos usados
// en estas pruebas.
global.DOMParser = class {
  parseFromString(value) {
    return {
      querySelectorAll() {
        return [];
      },
      body: {
        textContent: String(value)
          .replace(/<[^>]*>/g, ' ')
      }
    };
  }
};

function row(overrides = {}) {
  return {
    id: 1,
    url: 'https://example.com/react-19',
    title: 'React 19 para desarrollo web',
    description: 'Guía para crear aplicaciones con React.',
    source: 'Example',
    published_at: '2026-09-22T10:00:00Z',
    published: true,
    fetched_at: '2026-09-22T12:00:00Z',
    ...overrides
  };
}

test('publicationDate convierte una fecha válida', () => {
  assert.equal(
    publicationDate('2026-09-22T10:00:00Z'),
    '2026-09-22'
  );
});

test('publicationDate devuelve null con fecha inválida', () => {
  assert.equal(
    publicationDate('fecha-invalida'),
    null
  );
});

test('classify detecta JavaScript y frameworks', () => {
  const categories = classify(
    'Nueva versión de React con JavaScript'
  );

  assert.ok(
    categories.includes('javascript')
  );

  assert.ok(
    categories.includes('frameworks')
  );
});

test('classify detecta CSS', () => {
  const categories = classify(
    'CSS Grid, Flexbox y Tailwind'
  );

  assert.ok(
    categories.includes('css')
  );
});

test('detectLanguage detecta español', () => {
  assert.equal(
    detectLanguage(
      'Guía para crear una aplicación con React'
    ),
    'es'
  );
});

test('detectLanguage detecta inglés', () => {
  assert.equal(
    detectLanguage(
      'Learn how to build your application with React'
    ),
    'en'
  );
});

test('prepareItems convierte una fila de Supabase', () => {
  const items = prepareItems([
    row()
  ]);

  assert.equal(items.length, 1);

  const item = items[0];

  assert.equal(
    item.title,
    'React 19 para desarrollo web'
  );

  assert.equal(
    item.link,
    'https://example.com/react-19'
  );

  assert.equal(
    item.source.label,
    'Example'
  );

  assert.equal(
    item.date,
    '2026-09-22'
  );

  assert.ok(
    item.categories.includes('javascript')
  );

  assert.ok(
    item.categories.includes('frameworks')
  );
});

test('prepareItems descarta URLs inválidas', () => {
  const items = prepareItems([
    row({
      url: 'javascript:alert(1)'
    })
  ]);

  assert.equal(
    items.length,
    0
  );
});

test('prepareItems descarta filas sin título', () => {
  const items = prepareItems([
    row({
      title: null
    })
  ]);

  assert.equal(
    items.length,
    0
  );
});

test('prepareItems elimina HTML del título y descripción', () => {
  const items = prepareItems([
    row({
      title: '<strong>React</strong> para desarrollo',
      description: '<p>Una guía de React.</p>'
    })
  ]);

  assert.equal(
    items[0].title,
    'React para desarrollo'
  );

  assert.equal(
    items[0].description,
    'Una guía de React.'
  );
});

test('selectItems filtra por categoría', () => {
  const items = prepareItems([
    row({
      id: 1,
      url: 'https://example.com/react',
      title: 'React para desarrollo web'
    }),

    row({
      id: 2,
      url: 'https://example.com/css',
      title: 'CSS y Flexbox',
      description: 'Guía de estilos'
    })
  ]);

  const selected = selectItems(
    items,
    {
      category: 'css'
    }
  );

  assert.equal(
    selected.length,
    1
  );

  assert.equal(
    selected[0].link,
    'https://example.com/css'
  );
});

test('selectItems filtra por idioma', () => {
  const items = prepareItems([
    row({
      id: 1,
      url: 'https://example.com/es',
      title: 'Guía para crear aplicaciones web'
    }),

    row({
      id: 2,
      url: 'https://example.com/en',
      title: 'Learn how to build your web application',
      description: 'A guide for developers'
    })
  ]);

  const selected = selectItems(
    items,
    {
      language: 'en'
    }
  );

  assert.equal(
    selected.length,
    1
  );

  assert.equal(
    selected[0].source.language,
    'en'
  );
});

test('selectItems filtra por búsqueda', () => {
  const items = prepareItems([
    row({
      id: 1,
      url: 'https://example.com/react',
      title: 'React para desarrollo web'
    }),

    row({
      id: 2,
      url: 'https://example.com/css',
      title: 'CSS moderno',
      description: 'Guía de estilos CSS'
    })
  ]);

  const selected = selectItems(
    items,
    {
      query: 'React'
    }
  );

  assert.equal(
    selected.length,
    1
  );

  assert.match(
    selected[0].title,
    /React/
  );
});

test('selectItems elimina URLs duplicadas', () => {
  const items = prepareItems([
    row({
      id: 1
    }),

    row({
      id: 2
    })
  ]);

  const selected = selectItems(items);

  assert.equal(
    selected.length,
    1
  );
});

test('loadNews consulta news_articles correctamente', async () => {
  const calls = [];

  const query = {
    select(value) {
      calls.push(['select', value]);
      return this;
    },

    eq(column, value) {
      calls.push(['eq', column, value]);
      return this;
    },

    order(column, options) {
      calls.push([
        'order',
        column,
        options
      ]);

      return this;
    },

    limit(value) {
      calls.push(['limit', value]);

      return Promise.resolve({
        data: [
          row()
        ],
        error: null
      });
    }
  };

  const client = {
    from(table) {
      calls.push(['from', table]);
      return query;
    }
  };

  const result = await loadNews({
    client,
    limit: 50
  });

  assert.equal(
    result.length,
    1
  );

  assert.ok(
    calls.some(
      call =>
        call[0] === 'from' &&
        call[1] === 'news_articles'
    )
  );

  assert.ok(
    calls.some(
      call =>
        call[0] === 'eq' &&
        call[1] === 'published' &&
        call[2] === true
    )
  );

  assert.ok(
    calls.some(
      call =>
        call[0] === 'limit' &&
        call[1] === 50
    )
  );
});

test('loadNews propaga errores de Supabase', async () => {
  const expected =
    new Error('Supabase error');

  const query = {
    select() {
      return this;
    },

    eq() {
      return this;
    },

    order() {
      return this;
    },

    limit() {
      return Promise.resolve({
        data: null,
        error: expected
      });
    }
  };

  const client = {
    from() {
      return query;
    }
  };

  await assert.rejects(
    () => loadNews({ client }),
    expected
  );
});