const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Daily keeps only existing object items and orders them by ranking', async () => {
  const { prepareDailyItems } = await import('../js/home-daily-utils.mjs');
  const items = [
    { ranking: 2, title: 'Second' },
    { ranking: 1, title: 'First' }
  ];

  const prepared = prepareDailyItems(items);

  assert.deepEqual(prepared.map((item) => item.title), ['First', 'Second']);
  assert.equal(prepared.length, 2);
});

test('Daily wrapper class reflects every supported item count without changing items', async () => {
  const { dailyContentClass } = await import('../js/home-daily-utils.mjs');
  for (const count of [1, 2, 3, 4, 5]) {
    assert.equal(dailyContentClass(count), `daily-content daily-content--items-${count}`);
  }
});

test('Daily does not invent items when the array is empty or invalid', async () => {
  const { prepareDailyItems } = await import('../js/home-daily-utils.mjs');

  assert.deepEqual(prepareDailyItems([]), []);
  assert.deepEqual(prepareDailyItems(null), []);
  assert.deepEqual(prepareDailyItems([{ ranking: 1 }, null, 'invalid']), [{ ranking: 1 }]);
});

test('Daily external links accept HTTPS only', async () => {
  const { getSafeDailyUrl } = await import('../js/home-daily-utils.mjs');

  assert.equal(getSafeDailyUrl('https://example.com/story'), 'https://example.com/story');
  assert.equal(getSafeDailyUrl('javascript:alert(1)'), null);
  assert.equal(getSafeDailyUrl('http://example.com/story'), null);
  assert.equal(getSafeDailyUrl('not a URL'), null);
});

test('Daily reads only the newest row and renders exactly its existing items safely', async () => {
  class FakeElement {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.dataset = {};
      this.className = '';
      this.classList = {
        add: (...names) => { this.className = [...new Set(`${this.className} ${names.join(' ')}`.trim().split(/\s+/))].join(' '); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(' '); }
      };
    }
    get childNodes() { return this.children; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    remove() { this.removed = true; }
  }

  const root = new FakeElement('div');
  let selected;
  let ordering;
  let limit;
  const rows = [{
    daily_date: '2026-10-07',
    items: [
      { ranking: 1, category: 'IA', title: 'Noticia destacada', summary: 'Resumen', why_it_matters: 'Importa', url: 'https://source.example/one', image_url: 'https://source.example/one.jpg', source: 'Fuente Uno', published_at: '2026-10-07T09:00:00Z' },
      { ranking: 2, category: 'Web', title: 'Noticia dos', summary: 'Otro resumen', why_it_matters: 'Otro motivo', url: 'https://source.example/two', image_url: '', source: 'Fuente Dos', published_at: '2026-10-07T08:00:00Z' }
    ]
  }];
  const query = {
    select(value) { selected = value; return this; },
    order(column, options) { ordering = [column, options]; return this; },
    limit(value) { limit = value; return Promise.resolve({ data: rows, error: null }); }
  };

  const oldDocument = global.document;
  const oldWindow = global.window;
  global.document = {
    getElementById: (id) => id === 'homeDaily' ? root : null,
    createElement: (tag) => new FakeElement(tag)
  };
  global.window = { MiPortalSupabase: { from: (table) => { assert.equal(table, 'miportal_daily'); return query; } } };

  try {
    await import(`../js/home-daily.mjs?test=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(selected, 'daily_date, items');
    assert.deepEqual(ordering, ['daily_date', { ascending: false }]);
    assert.equal(limit, 1);
    assert.equal(root.dataset.state, 'loaded');

    const walk = (node) => [node, ...node.children.flatMap(walk)];
    const nodes = walk(root);
    assert.equal(nodes.filter((node) => node.tagName === 'article' && node.className.includes('daily-card')).length, 2);
    assert.ok(nodes.some((node) => node.className === 'daily-content daily-content--items-2'));
    assert.equal(nodes.filter((node) => node.tagName === 'img').length, 1);
    assert.equal(nodes.filter((node) => node.className.includes('daily-image-fallback')).length, 2);
    const links = nodes.filter((node) => node.tagName === 'a');
    assert.equal(links.length, 2);
    assert.ok(links.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer'));

    const image = nodes.find((node) => node.tagName === 'img');
    image.naturalWidth = 119;
    assert.equal(image.removed, undefined);
    assert.ok(nodes.includes(image));
    image.listeners.error();
    assert.equal(image.removed, true);
    assert.ok(nodes.some((node) => node.className.includes('daily-image-fallback')));
  } finally {
    global.document = oldDocument;
    global.window = oldWindow;
  }
});

test('Daily Supabase errors stay inside the Daily section', async () => {
  const root = {
    dataset: {},
    children: [],
    setAttribute() {},
    removeAttribute() {},
    replaceChildren(...nodes) { this.children = nodes; }
  };
  const oldDocument = global.document;
  const oldWindow = global.window;
  global.document = {
    getElementById: (id) => id === 'homeDaily' ? root : null,
    createElement: () => ({
      children: [],
      setAttribute() {},
      append(...nodes) { this.children.push(...nodes); }
    })
  };
  global.window = {
    MiPortalSupabase: {
      from: () => ({
        select() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: null, error: new Error('RLS not applied') }); }
      })
    }
  };

  try {
    await import(`../js/home-daily.mjs?error-test=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(root.dataset.state, 'error');
    assert.equal(root.children.length, 1);
  } finally {
    global.document = oldDocument;
    global.window = oldWindow;
  }
});

test('Daily empty result has its own state and responsive breakpoints are present', async () => {
  class FakeElement {
    constructor() { this.children = []; }
    setAttribute() {}
    append(...nodes) { this.children.push(...nodes); }
  }
  const root = {
    dataset: {},
    setAttribute() {},
    removeAttribute() {},
    replaceChildren(...nodes) { this.children = nodes; }
  };
  const oldDocument = global.document;
  const oldWindow = global.window;
  global.document = {
    getElementById: (id) => id === 'homeDaily' ? root : null,
    createElement: () => new FakeElement()
  };
  global.window = {
    MiPortalSupabase: {
      from: () => ({
        select() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({ data: [], error: null }); }
      })
    }
  };

  try {
    await import(`../js/home-daily.mjs?empty-test=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(root.dataset.state, 'empty');
    const css = fs.readFileSync('styles.css', 'utf8');
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*daily-card--featured/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*daily-more/);
    assert.match(css, /\.daily-more\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*16rem\),\s*1fr\)\)/);
    assert.match(css, /\.daily-content--items-2\s+\.daily-more\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  } finally {
    global.document = oldDocument;
    global.window = oldWindow;
  }
});
