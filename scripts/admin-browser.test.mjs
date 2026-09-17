import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const fixtures = ['React', 'Fundamentos', 'Legacy category'].map((category, i) => ({
  id: `fixture-${i}`, title: `Fixture ${category}`, description: 'Fixture description',
  category, url: 'https://example.test/resource', published: i !== 1
}));
const mock = `
  window.pending = [];
  window.writes = [];
  window.networkAttempts = [];
  window.fetch = (...args) => {
    networkAttempts.push(args);
    throw new Error('Network is forbidden in this fixture');
  };
  const query = {
    select() { return this; }, eq() { return this; },
    maybeSingle() { return new Promise(resolve => pending.push(resolve)); },
    update(payload) {
      writes.push({ type: 'update', payload });
      return { eq: async (key, id) => {
        writes[writes.length - 1].id = id;
        return { error: { message: 'Fixture write intercepted' } };
      } };
    },
    async insert(payload) {
      writes.push({ type: 'insert', payload });
      return { error: { message: 'Fixture write intercepted' } };
    }
  };
  window.Admin = {
    supabase: { from: () => query },
    requireAdmin: async () => Admin.supabase,
    showToast() {},
    ResourceAPI: {
      listAll: () => new Promise((resolve, reject) =>
        pending.push(result => result.error ?
          reject(new Error(result.error)) : resolve(result.data)))
    }
  };
`;

test('admin browser regressions with isolated fixtures',
  { timeout: 60000 }, async t => {
    const allowed = new Set([
      '/admin/index.html', '/admin/recurso-form.html', '/admin/admin.css',
      '/styles.css', '/js/admin/index.js', '/js/admin/recurso-form.js'
    ]);
    const server = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/mock.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(mock);
        return;
      }
      if (!allowed.has(path)) { res.writeHead(404).end(); return; }
      let content = await readFile(new URL(path.slice(1), root), 'utf8');
      if (path.endsWith('.html')) {
        const script = path.includes('recurso-form') ? 'recurso-form' : 'index';
        content = content.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace('</body>', '<script src="/mock.js"></script>' +
            `<script src="/js/admin/${script}.js"></script></body>`);
      }
      res.setHeader('Content-Type', path.endsWith('.html') ? 'text/html' :
        path.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(content);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const profile = await mkdtemp('/tmp/opencode/portal-admin-');
    const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--remote-debugging-pipe', `--user-data-dir=${profile}`,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    t.after(() => chrome.kill());
    let sequence = 0;
    let buffer = '';
    const pending = new Map();
    chrome.stdio[4].on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\0')) !== -1) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        pending.get(message.id)?.(message);
      }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => reject(new Error(method)), 10000);
      pending.set(id, message => {
        clearTimeout(timeout);
        pending.delete(id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', {
      targetId, flatten: true
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      }, sessionId);
      assert.equal(result.exceptionDetails, undefined);
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.fail(`Not observed: ${expression}`);
    };
    const origin = `http://127.0.0.1:${server.address().port}`;
    const navigate = async path => {
      await evaluate('window.Admin = undefined');
      await send('Page.navigate', { url: origin + path }, sessionId);
      await waitFor(`!!window.Admin && document.readyState === 'complete'`);
    };
    const settle = async result => {
      await waitFor('pending.length === 1');
      await evaluate(`pending.shift()(${JSON.stringify(result)})`);
    };
    const visible = id => evaluate(
      `getComputedStyle(document.getElementById('${id}')).display !== 'none'`
    );
    const state = async expected => {
      for (const id of ['listLoading', 'listEmpty', 'listError', 'resourceList']) {
        assert.equal(await visible(id), id === expected, id);
      }
    };
    const change = async (id, value, event = 'change') => evaluate(`
      document.getElementById('${id}').value = ${JSON.stringify(value)};
      document.getElementById('${id}').dispatchEvent(new Event('${event}'));
    `);
    const noNetwork = async () => {
      assert.deepEqual(await evaluate('networkAttempts'), []);
      assert.equal(await evaluate(`performance.getEntriesByType('resource')
        .every(entry => entry.name.startsWith(${JSON.stringify(origin)}))`), true);
    };

    await t.test('exclusive loading, empty, error, retry and loaded states', async () => {
      await navigate('/admin/index.html');
      await state('listLoading');
      await settle({ data: [] });
      await state('listEmpty');
      assert.equal(await visible('listEmptyClear'), false);
      assert.equal(await visible('listEmptyCreate'), true);
      await navigate('/admin/index.html');
      await settle({ error: 'Fixture failure' });
      await state('listError');
      await evaluate(`document.getElementById('listRetry').click()`);
      await state('listLoading');
      await settle({ data: fixtures });
      await state('resourceList');
      assert.equal(await evaluate(`document.querySelectorAll('.resource-row').length`), 3);
      await noNetwork();
    });

    await t.test('category, status and search filters and clearing no matches', async () => {
      await navigate('/admin/index.html');
      await settle({ data: fixtures });
      for (const category of ['React', 'Fundamentos']) {
        await change('filterCategory', category);
        assert.equal(await evaluate(`document.querySelectorAll('.resource-row').length`), 1);
        assert.equal(await evaluate(`document.querySelector('.resource-meta')
          .textContent.startsWith('${category}')`), true);
      }
      await change('filterStatus', 'true');
      await state('listEmpty');
      assert.equal(await visible('listEmptyCreate'), false);
      assert.equal(await visible('listEmptyClear'), true);
      await evaluate(`document.getElementById('listEmptyClear').click()`);
      await state('resourceList');
      await change('filterSearch', 'fixture react', 'input');
      assert.equal(await evaluate(`document.querySelectorAll('.resource-row').length`), 1);
      assert.deepEqual(await evaluate('writes'), []);
      await noNetwork();
    });

    await t.test('editing preserves known and legacy categories in saved payloads', async () => {
      for (const fixture of fixtures) {
        await navigate(`/admin/recurso-form.html?id=${fixture.id}`);
        await settle({ data: fixture });
        assert.equal(await evaluate(`document.getElementById('category').value`),
          fixture.category);
        assert.equal(await visible('loadError'), false);
        await change('title', 'Edited fixture');
        await evaluate(`document.getElementById('resourceForm').requestSubmit()`);
        await waitFor('writes.length === 1');
        const [write] = await evaluate('writes');
        assert.equal(write.type, 'update');
        assert.equal(write.id, fixture.id);
        assert.equal(write.payload.category, fixture.category);
        assert.equal(write.payload.title, 'Edited fixture');
        await noNetwork();
      }
    });

    await t.test('failed editor load hides form', async () => {
      await navigate('/admin/recurso-form.html?id=missing');
      await settle({ data: null });
      assert.equal(await visible('resourceForm'), false);
      assert.equal(await visible('loadError'), true);
      assert.deepEqual(await evaluate('writes'), []);
      await noNetwork();
    });

    await t.test('title limit rejects 161 and accepts 160 before mock writes', async () => {
      await navigate('/admin/recurso-form.html');
      assert.equal(await evaluate(`document.getElementById('title').maxLength`), 160);
      await change('description', 'Fixture description');
      await change('url', 'https://example.test/resource');
      await change('category', 'React');
      await change('title', 'x'.repeat(161));
      await evaluate(`document.getElementById('resourceForm').requestSubmit()`);
      assert.deepEqual(await evaluate('writes'), []);
      assert.equal(await visible('fieldError'), true);
      assert.equal(await evaluate(`document.activeElement.id`), 'title');
      await change('title', 'x'.repeat(160));
      await evaluate(`document.getElementById('resourceForm').requestSubmit()`);
      await waitFor('writes.length === 1');
      assert.equal(await evaluate('writes[0].payload.title.length'), 160);
      assert.equal(await evaluate('writes[0].type'), 'insert');
      await noNetwork();
    });
  });
