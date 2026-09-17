import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const mock = `
  window.pending = []; window.calls = []; window.violations = [];
  addEventListener('securitypolicyviolation', e => violations.push(e.violatedDirective));
  if (location.search.includes('timeout')) {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = () => timeout(50);
  }
  if (!location.search.includes('transport')) {
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      calls.push({url, body: JSON.parse(options.body)});
      pending.push({resolve, reject});
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    });
  }
  addEventListener('DOMContentLoaded', () => { window.testReady = true; });
`;

test('contact in Chrome: retry, reset, accessibility and actual page CSP', async t => {
  let transportCalls = 0;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/contact') {
      transportCalls++;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Fixture: servicio no disponible.' }));
      return;
    }
    if (path === '/mock.js' || path === '/js/contact.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(path === '/mock.js' ? mock
        : await readFile(new URL('js/contact.js', root)));
      return;
    }
    if (path === '/contacto.html') {
      const html = await readFile(new URL('contacto.html', root), 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace('</body>', '<script src="/mock.js"></script>' +
          '<script src="/js/contact.js"></script></body>'));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const profile = await mkdtemp(join(tmpdir(), 'portal-contact-'));
  const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--disable-background-networking', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`
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
    const timer = setTimeout(() => reject(Error(`Timeout: ${method}`)), 10000);
    waiting.set(id, message => {
      clearTimeout(timer); waiting.delete(id);
      if (message.error) reject(Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', { urls: ['https://*'] }, sessionId);
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
  const navigate = async suffix => {
    await evaluate('window.testReady = false');
    await send('Page.navigate', {
      url: `http://127.0.0.1:${server.address().port}/contacto.html${suffix}`
    }, sessionId);
    await waitFor('window.testReady === true');
    await evaluate(`document.querySelector('[name=name]').value = 'Local fixture';
      document.querySelector('[name=email]').value = 'test@example.com';
      document.querySelector('[name=subject]').value = 'Consulta de prueba';
      document.querySelector('[name=message]').value = 'Only mocked contact content';`);
  };
  const submit = () => evaluate('contactForm.requestSubmit()');
  const idle = () => waitFor('!contactForm.querySelector("button").disabled');
  await t.test('double submit, failure preserves text, retry reuses key, success resets',
    async () => {
      await navigate('');
      await submit(); await submit();
      assert.equal(await evaluate('calls.length'), 1);
      assert.equal(await evaluate('contactForm.getAttribute("aria-busy")'), 'true');
      assert.equal(await evaluate('contactStatus.getAttribute("role")'), 'status');
      await evaluate(`pending.shift().resolve({ok:false, status:503,
        json:async()=>({error:'Servicio no disponible.'})})`);
      await idle();
      assert.match(await evaluate('contactStatus.textContent'), /no disponible/);
      assert.equal(await evaluate('contactForm.elements.message.value'),
        'Only mocked contact content');
      await submit();
      assert.deepEqual(await evaluate('calls[0].body'), await evaluate('calls[1].body'));
      await evaluate(`pending.shift().resolve({ok:true, status:202,
        json:async()=>({message:'Mensaje aceptado por el servicio de correo.'})})`);
      await idle();
      assert.equal(await evaluate('contactForm.elements.message.value'), '');
      assert.equal(await evaluate('contactForm.hasAttribute("aria-busy")'), false);
      assert.match(await evaluate('contactStatus.textContent'), /aceptado/);
      await evaluate(`contactForm.elements.name.value = 'Another fixture';
        contactForm.elements.email.value = 'other@example.com';
        contactForm.elements.subject.value = 'Otro asunto distinto';
        contactForm.elements.message.value = 'New intentional contact message';`);
      await submit();
      assert.notEqual(await evaluate('calls[1].body.requestId'),
        await evaluate('calls[2].body.requestId'));
      await evaluate(`contactForm.elements.message.value = 'Edited while waiting';
        pending.shift().resolve({ok:true, status:202,
          json:async()=>({message:'Mensaje aceptado.'})})`);
      await idle();
      assert.equal(await evaluate('contactForm.elements.message.value'),
        'Edited while waiting');
    });
  await t.test('invalid JSON and timeout release controls without clearing text',
    async () => {
      await navigate(''); await submit();
      await evaluate(`pending.shift().resolve({ok:false, status:502,
        json:async()=>{throw Error('raw internal diagnostic')}})`);
      await idle();
      assert.equal(await evaluate('contactStatus.textContent.includes("diagnostic")'),
        false);
      assert.equal(await evaluate('contactForm.elements.message.value'),
        'Only mocked contact content');
      await navigate('?timeout'); await submit(); await idle();
      assert.match(await evaluate('contactStatus.textContent'), /tardó|confirmar/);
      assert.equal(await evaluate('contactForm.elements.message.value'),
        'Only mocked contact content');
    });
  await t.test('rate limit keeps the draft and displays the server wait', async () => {
    await navigate(''); await submit();
    await evaluate(`pending.shift().resolve({ok:false, status:429,
      json:async()=>({error:'Límite de envíos alcanzado. Espera 3600 segundos.'})})`);
    await idle();
    assert.match(await evaluate('contactStatus.textContent'), /3600 segundos/);
    assert.equal(await evaluate('contactForm.elements.message.value'),
      'Only mocked contact content');
  });
  await t.test('same-origin fetch passes CSP and gets only a local fixture', async () => {
    await navigate('?transport'); await submit(); await idle();
    assert.equal(transportCalls, 1);
    assert.match(await evaluate('contactStatus.textContent'), /Fixture/);
    assert.deepEqual(await evaluate('violations.filter(v=>v==="connect-src")'), []);
  });
});
