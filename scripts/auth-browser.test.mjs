import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
// SDK real, transporte HTTP simulado: no usa credenciales ni servicios remotos.
const transport = `
  window.violations = [];
  addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
  window.MIPORTAL_SUPABASE = {
    url: 'https://fixture.supabase.co', publishableKey: 'fixture-public-key'
  };
  const user = { id: '00000000-0000-0000-0000-000000000002',
    email: 'viewer@example.test', aud: 'authenticated', role: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  window.fixtureToken = btoa(JSON.stringify({alg:'HS256',typ:'JWT'})) + '.' +
    btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})) + '.fixture';
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    let data = {};
    if (url.includes('/token')) data = {
      access_token: fixtureToken, refresh_token: 'fixture-refresh',
      expires_in: 3600, token_type: 'bearer', user
    };
    else if (url.includes('/user')) data = user;
    else if (url.includes('/profiles')) data = {role: localStorage.testRole || 'viewer'};
    else if (url.includes('/resources')) data = [];
    return new Response(JSON.stringify(data), {
      status: 200, headers: {'Content-Type':'application/json'}
    });
  };
`;

test('Chrome: real Supabase SDK persistence, guards, recovery and accessible errors',
  { timeout: 60000 }, async t => {
    const server = createServer(async (req, res) => {
      try {
        let path = new URL(req.url, 'http://localhost').pathname;
        if (path === '/fixture.js') {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(transport);
          return;
        }
        if (path === '/sdk.js') {
          path = '/node_modules/@supabase/supabase-js/dist/umd/supabase.js';
        }
        if (path.endsWith('/')) path += 'index.html';
        if (path === '/js/reset-password.js') {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (path.includes('..')) { res.writeHead(404).end(); return; }
        let content = await readFile(new URL(path.slice(1), root));
        if (path.endsWith('.html')) {
          content = content.toString().replace(
            /<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2"><\/script>/,
            '<script src="/fixture.js"></script><script src="/sdk.js"></script>')
            .replace(/<script src="(?:\.\.\/)?supabase-config.js"><\/script>/, '');
          res.setHeader('Content-Type', 'text/html');
        } else {
          res.setHeader('Content-Type', path.endsWith('.js') ?
            'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/plain');
        }
        res.end(content);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const profile = await mkdtemp('/tmp/opencode/portal-auth-');
    const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--remote-debugging-pipe', `--user-data-dir=${profile}`
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
      const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
      pending.set(id, message => {
        clearTimeout(timeout);
        pending.delete(id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, replMode: true
      }, sessionId);
      assert.equal(result.exceptionDetails, undefined,
        JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.fail(`Not observed: ${expression}`);
    };
    const origin = `http://127.0.0.1:${server.address().port}`;
    const navigate = async path => {
      await send('Page.navigate', { url: origin + path }, sessionId);
      await waitFor(`location.pathname === ${JSON.stringify(path.split(/[?#]/)[0])}
        && document.readyState === 'complete'`);
    };
    await navigate('/login.html');
    await evaluate(`document.getElementById('loginForm').requestSubmit()`);
    assert.equal(await evaluate(`document.getElementById('errorMessages').hidden`), false);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('errorMessages')).display === 'none'`), false);
    assert.equal(await evaluate(`document.activeElement.id`), 'email');
    await evaluate(`document.getElementById('email').value = 'viewer@example.test';
      document.getElementById('password').value = 'fixture-password';
      document.getElementById('loginForm').requestSubmit()`);
    await waitFor(`location.pathname === '/index.html' &&
      document.querySelector('#auth-nav-item button')?.textContent === 'Cerrar sesión'`);
    assert.equal(await evaluate(`!!document.querySelector('#auth-nav-item a[href="/admin/"]')`), false);
    await navigate('/recursos.html');
    await waitFor(`!!document.querySelector('#auth-nav-item button')`);
    assert.equal(await evaluate(`!!(await MiPortalSupabase.auth.getSession()).data.session`), true);
    await send('Page.navigate', { url: origin + '/admin/' }, sessionId);
    await waitFor(`location.pathname === '/login.html' && location.search.includes('no_autorizado')`);
    await waitFor(`!!document.getElementById('loginAlert')?.textContent`);
    assert.equal(await evaluate(`!!(await MiPortalSupabase.auth.getSession()).data.session`), true);
    await evaluate(`localStorage.testRole = 'admin'`);
    await send('Page.navigate', { url: origin + '/login.html' }, sessionId);
    await waitFor(`location.pathname === '/admin/' && document.readyState === 'complete'`);
    await waitFor(`document.getElementById('listEmpty')?.hidden === false`);
    await navigate('/recursos.html');
    await waitFor(`!!document.querySelector('#auth-nav-item a[href="/admin/"]')`);
    await evaluate(`MiPortalSupabase.auth.signOut()`);
    await navigate('/reset-password.html');
    await waitFor(`document.getElementById('resetAlert')?.textContent.includes('expiró')`);
    assert.equal(await evaluate(`document.getElementById('submitButton').disabled`), true);
    const token = await evaluate('fixtureToken');
    await navigate('/recovery.html');
    await navigate('/reset-password.html#access_token=' + encodeURIComponent(token) +
      '&refresh_token=fixture-refresh&expires_in=3600&token_type=bearer&type=recovery');
    await waitFor(`document.getElementById('submitButton')?.disabled === false`);
    assert.equal(await evaluate('location.hash'), '');
    await evaluate(`document.getElementById('password').value = 'new-fixture-password';
      document.getElementById('confirmPassword').value = 'new-fixture-password';
      document.getElementById('resetForm').requestSubmit()`);
    await waitFor(`document.getElementById('resetForm')?.hidden === true`);
    await waitFor(`document.getElementById('resetAlert')?.textContent.includes('Ya podés')`);
    assert.equal(await evaluate(`(await MiPortalSupabase.auth.getSession()).data.session`), null);
    assert.deepEqual(await evaluate(`violations.filter(v => v.startsWith('script-src'))`), []);
  });
