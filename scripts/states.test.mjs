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
  addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.testReady = true; }, 0);
  });
  addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
  window.fetch = () => new Promise(resolve => pending.push(resolve));
  const query = {
    select() { return this; }, eq() { return this; },
    order() { return new Promise(resolve => pending.push(resolve)); }
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
      } else if (path === '/main.js' || path === '/styles.css') {
        res.setHeader('Content-Type', path.endsWith('.js')
          ? 'text/javascript' : 'text/css');
        res.end(await readFile(new URL(path.slice(1), root)));
      } else if (['/recursos.html', '/noticias.html'].includes(path)) {
        const html = await readFile(new URL(path.slice(1), root), 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace('</body>',
            '<script src="/mock.js"></script><script src="/main.js"></script></body>'));
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
        await evaluate(`pending.shift()(${resources ? JSON.stringify(payload)
          : `{ok: true, json: async () => (${JSON.stringify(payload)})}`})`);
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
      await waitFor(`!!document.querySelector('${grid} .loading-spinner') && window.pending?.length === 1`);
      await settle(resources ? { data: [{ title: 'Recovered resource',
        description: 'Resource description', url: 'https://example.com' }] }
        : { status: 'ok', items: [{ title: 'Recovered news',
          description: 'News description', link: 'https://elpais.com/america-colombia/noticia.html' },
          { title: 'International news', link: 'https://elpais.com/internacional/noticia.html' }] });
      assert.equal(await evaluate(`document.querySelectorAll('${grid} .card').length`), 1);
      assert.equal(await evaluate(`!!document.querySelector('${grid} .loading-state, ${grid} .error-state')`), false);
      assert.equal(await evaluate(`document.querySelector('${grid}').hasAttribute('aria-busy')`), false);
      assert.deepEqual(await evaluate(`violations.filter(v => v.startsWith('script-src'))`), []);
    });
  }
  await t.test('resources: missing configuration has message and no retry', async () => {
    await navigate('recursos.html?missing');
    assert.equal(await evaluate(`!!document.querySelector('#resourcesGrid .error-state p')?.textContent.includes('no está configurada')`), true);
    assert.equal(await evaluate(`document.querySelector('#resourcesGrid .retry-button')`), null);
  });
});
