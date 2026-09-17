import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const mock = `
  window.pending = [];
  window.violations = [];
  if (location.search.includes('timeout')) {
    const originalTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) =>
      originalTimeout(callback, delay === 10000 ? 50 : delay, ...args);
  }
  addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.testReady = true; }, 0);
  });
  addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
  window.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
    const entry = { url, resolve };
    pending.push(entry);
    signal?.addEventListener('abort', () => {
      pending = pending.filter(item => item !== entry);
      reject(new Error('Aborted'));
    });
  });
  const query = {
    select() { return this; }, eq() { return this; },
    order() { return new Promise(resolve => pending.push({ resolve })); }
  };
  if (!location.search.includes('missing')) {
    window.MiPortalSupabase = { from: () => query };
  }
`;

test('resource and news states in Chrome with page CSP', async (t) => {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/mock.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(mock);
      } else if (['/main.js', '/styles.css', '/js/news-page.mjs',
        '/js/news-feed.mjs'].includes(path)) {
        res.setHeader('Content-Type', /\.m?js$/.test(path)
          ? 'text/javascript' : 'text/css');
        res.end(await readFile(new URL(path.slice(1), root)));
      } else if (['/recursos.html', '/noticias.html'].includes(path)) {
        const html = await readFile(new URL(path.slice(1), root), 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace('</body>',
            '<script src="/mock.js"></script><script src="/main.js"></script>' +
            (path === '/noticias.html'
              ? '<script type="module" src="/js/news-page.mjs"></script>' : '') +
            '</body>'));
      } else {
        res.writeHead(404).end();
      }
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const profile = await mkdtemp(join(tmpdir(), 'portal-states-'));
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-pipe', `--user-data-dir=${profile}`
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  t.after(() => chrome.kill());
  let sequence = 0;
  let buffer = '';
  const waiting = new Map();
  chrome.stdio[4].on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      waiting.get(message.id)?.(message);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
    waiting.set(id, message => {
      clearTimeout(timeout);
      waiting.delete(id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    }, sessionId);
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail(`Not observed: ${expression}`);
  };
  const navigate = async path => {
    await evaluate('window.testReady = false');
    await send('Page.navigate', {
      url: `http://127.0.0.1:${server.address().port}/${path}`
    }, sessionId);
    await waitFor('window.testReady === true');
  };
  for (const section of ['resources', 'news']) {
    await t.test(`${section}: loading, empty, error, retry and success`, async () => {
      const resources = section === 'resources';
      const page = resources ? 'recursos.html' : 'noticias.html';
      const grid = resources ? '#resourcesGrid' : '#cardsContainer';
      await navigate(page);
      assert.equal(await evaluate(`!!document.querySelector('${grid} .loading-spinner')`), true);
      if (resources) {
        assert.equal(await evaluate(`document.querySelector('${grid}').getAttribute('aria-busy')`), 'true');
      }
      const settle = async payload => {
        await evaluate(`pending.splice(0).forEach(entry => entry.resolve(${resources
          ? JSON.stringify(payload)
          : `{ok: true, json: async () => (${JSON.stringify(payload)})}`}))`);
        await waitFor(`!document.querySelector('${grid}').hasAttribute('aria-busy')`);
      };
      await settle(resources ? { data: [] } : { status: 'ok', items: [] });
      assert.equal(await evaluate(`!!document.querySelector('${grid} .empty-state .empty-icon')`), true);
      assert.equal(await evaluate(`!!document.querySelector('${grid} .empty-state p')?.textContent`), true);
      assert.equal(await evaluate(`document.querySelector('${grid}').hasAttribute('aria-busy')`), false);
      await navigate(page);
      await settle(resources ? { error: { message: 'Controlled failure' } }
        : { status: 'error' });
      assert.equal(await evaluate(`!!document.querySelector('${grid} .error-icon')`), true);
      assert.equal(await evaluate(`!!document.querySelector('${grid} .error-state p')?.textContent`), true);
      assert.equal(await evaluate(`document.querySelector('${grid}').hasAttribute('aria-busy')`), false);
      assert.equal(await evaluate(`document.querySelector('${grid} .retry-button')?.hasAttribute('onclick')`), false);
      await evaluate(`document.querySelector('${grid} .retry-button').click()`);
      await waitFor(`!!document.querySelector('${grid} .loading-spinner') && window.pending?.length === ${resources ? 1 : 5}`);
      await settle(resources ? { data: [{ title: 'Recovered resource',
        description: 'Resource description', url: 'https://example.com' }] }
        : { status: 'ok', items: [{ title: 'Fixture: recovered CSS news',
          description: 'Test-only description', link: 'https://css-tricks.com/test-fixture/' },
          { title: 'International news', link: 'https://elpais.com/internacional/noticia.html' }] });
      assert.equal(await evaluate(`document.querySelectorAll('${grid} .card').length`), 1);
      assert.equal(await evaluate(`!!document.querySelector('${grid} .loading-state, ${grid} .error-state')`), false);
      assert.equal(await evaluate(`document.querySelector('${grid}').hasAttribute('aria-busy')`), false);
      assert.deepEqual(await evaluate(`violations.filter(v => v.startsWith('script-src'))`), []);
    });
  }
  await t.test('news: combined filters, safe attribution, partial failure and cache', async () => {
    await navigate('noticias.html');
    const fixtures = {
      'https://www.paradigmadigital.com/feed/': [{
        title: 'Angular Zoneless: detección de cambios',
        link: 'https://www.paradigmadigital.com/dev/angular-zoneless-siguiente-paso-evolucion-deteccion-cambios/',
        pubDate: '2026-09-04 06:00:00'
      }],
      'https://www.smashingmagazine.com/feed/': [{
        title: 'Stop Treating CSS Container Queries Like Traditional Media Queries',
        link: 'https://smashingmagazine.com/2026/09/stop-treating-css-container-queries-traditional-media-queries/',
        pubDate: '2026-09-16 10:00:00', categories: ['CSS'],
        description: '<p>Fixture markup</p><script>window.injected=true</script>'
      }],
      'https://www.campusmvp.es/recursos/syndication.axd': [{
        title: 'Fixture: Blazor sin fecha', pubDate: null,
        link: 'https://www.campusmvp.es/recursos/test-fixture'
      }]
    };
    await evaluate(`pending.splice(0).forEach(({url, resolve}) => {
      const feed = new URL(url).searchParams.get('rss_url');
      resolve({ok: true, json: async () => ({status: 'ok',
        items: (${JSON.stringify(fixtures)})[feed] || []})});
    })`);
    await waitFor(`document.querySelectorAll('.news-card').length === 3`);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.news-date'),
      node => [node.textContent, node.getAttribute('datetime')])`), [
      ['Publicado: 16/09/2026', '2026-09-16'],
      ['Publicado: 04/09/2026', '2026-09-04'], ['Fecha no disponible', null]
    ]);
    assert.equal(await evaluate('window.injected === undefined'), true);
    assert.equal(await evaluate(`document.querySelector('.news-card a').href`),
      fixtures['https://www.smashingmagazine.com/feed/'][0].link);
    assert.equal(await evaluate(`document.querySelector('.news-card a').rel`),
      'noopener noreferrer');
    assert.match(await evaluate(`document.querySelector('.news-card .tag').textContent`),
      /Smashing Magazine · Inglés/);
    await evaluate(`searchInput.value = 'angular deteccion';
      searchForm.requestSubmit();
      document.querySelector('[data-query="javascript"]').click();
      newsLanguage.value = 'es'; newsLanguage.dispatchEvent(new Event('change'));`);
    assert.equal(await evaluate(`document.querySelectorAll('.news-card').length`), 1);
    assert.equal(await evaluate('searchInput.value'), 'angular deteccion');
    await evaluate(`document.querySelector('[data-query="css"]').click()`);
    assert.equal(await evaluate(`!!document.querySelector('.empty-state')`), true);
    await evaluate('resetNews.click()');
    assert.equal(await evaluate(`document.querySelectorAll('.news-card').length`), 3);
    await evaluate(`searchInput.value = 'Java'; searchForm.requestSubmit()`);
    assert.equal(await evaluate(`!!document.querySelector('.empty-state')`), true);
    await evaluate(`searchInput.value = ''; searchForm.requestSubmit()`);
    assert.equal(await evaluate(`document.querySelectorAll('.news-card').length`), 3);
    assert.equal(await evaluate('pending.length'), 0);
    await evaluate('refreshNews.click()');
    assert.equal(await evaluate('refreshNews.disabled'), true);
    await evaluate(`pending.splice(0).forEach(({url, resolve}) => resolve({
      ok: true, json: async () => new URL(url).searchParams.get('rss_url')
        === 'https://www.smashingmagazine.com/feed/' ? {status: 'error'}
        : {status: 'ok', items: []}
    }))`);
    await waitFor('!refreshNews.disabled');
    assert.equal(await evaluate(`document.querySelectorAll('.news-card').length`), 1);
    assert.match(await evaluate('newsStatus.textContent'), /Smashing Magazine/);
    await evaluate('refreshNews.click()');
    await evaluate(`pending.splice(0).forEach(({resolve}) => resolve({ok: false}))`);
    await waitFor('!refreshNews.disabled');
    assert.equal(await evaluate(`document.querySelectorAll('.news-card').length`), 1);
    assert.equal(await evaluate(`cardsContainer.hasAttribute('aria-busy')`), false);
    assert.match(await evaluate('lastUpdated.textContent'), /^Última consulta:/);
    assert.deepEqual(await evaluate(`violations.filter(v => v.startsWith('script-src'))`), []);
  });
  await t.test('resources: missing configuration has message and no retry', async () => {
    await navigate('recursos.html?missing');
    assert.equal(await evaluate(`!!document.querySelector('#resourcesGrid .error-state p')?.textContent.includes('no está configurada')`), true);
    assert.equal(await evaluate(`document.querySelector('#resourcesGrid .retry-button')`), null);
  });
  await t.test('news: timed out requests release controls and allow retry', async () => {
    await navigate('noticias.html?timeout');
    await waitFor(`!!document.querySelector('#cardsContainer .error-state')`);
    assert.equal(await evaluate('refreshNews.disabled'), false);
    assert.equal(await evaluate('cardsContainer.hasAttribute("aria-busy")'), false);
    assert.equal(await evaluate('pending.length'), 0);
    await evaluate(`document.querySelector('#cardsContainer .retry-button').click();
      pending.splice(0).forEach(({resolve}) => resolve({ok: true,
        json: async () => ({status: 'ok', items: []})}));`);
    await waitFor(`!!document.querySelector('#cardsContainer .empty-state')`);
    assert.equal(await evaluate('refreshNews.disabled'), false);
  });
});
