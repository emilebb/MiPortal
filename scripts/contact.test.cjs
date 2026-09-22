const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact');

const input = () => ({
  name: 'Prueba local', email: 'Test@Example.com',
  subject: 'Consulta sobre MiPortal',
  message: 'Mensaje ficticio de prueba.', website: '',
  requestId: 'da287f3e-669e-4f10-9640-f987e23a9f40', createdAt: Date.now()
});
const config = { VERCEL: '1' };
async function run(body = input(), headers = {}, method = 'POST') {
  const res = {
    headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.code = n; return this; },
    json(value) { this.body = value; return this; }
  };
  await handler({ method, headers: {
    origin: 'https://www.miportal.me', 'content-type': 'application/json',
    'x-vercel-forwarded-for': '192.0.2.1', ...headers
  }, body, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  return res;
}
const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, headers: new Headers(headers)
});

test('contact API forwards the form to the n8n webhook with validation and bounded abuse', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
  let calls = [];
  let provider = () => reply(202, {});
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, ...options, payload: JSON.parse(options.body) });
    assert.equal(url, 'https://n8n.miportal.me/webhook/miportal-contacto');
    return provider(options);
  });

  await t.test('acceptance sends name, email, subject, message, requestId and createdAt',
    async () => {
      handler.resetRateLimit();
      calls = [];
      const body = input();
      const response = await run(body);
      assert.equal(response.code, 202);
      assert.equal(response.body.message, 'Mensaje enviado correctamente. Recibirás la respuesta en tu correo.');
      assert.equal(calls.length, 1);
      const sent = calls[0];
      assert.equal(sent.method, 'POST');
      assert.equal(sent.redirect, 'error');
      assert.equal(sent.headers['Content-Type'], 'application/json');
      assert.equal(sent.payload.name, 'Prueba local');
      assert.equal(sent.payload.email, 'test@example.com');
      assert.equal(sent.payload.subject, 'Consulta sobre MiPortal');
      assert.equal(sent.payload.message, 'Mensaje ficticio de prueba.');
      assert.equal(sent.payload.requestId, body.requestId);
      assert.equal(sent.payload.createdAt, body.createdAt);
      assert.equal(Object.keys(sent.payload).length, 6);
    });

  await t.test('forwards user input as plain fields after trim and lowercase only',
    async () => {
      handler.resetRateLimit();
      calls = [];
      const body = {
        ...input(),
        name: '  Al <script>alert(1)</script>  ',
        subject: '  A & B <b>"cita"</b>  ',
        message: ' Línea 1\n<script>alert(2)</script>\n" & \' < > '
      };
      assert.equal((await run(body)).code, 202);
      const sent = calls[0].payload;
      assert.equal(sent.name, 'Al <script>alert(1)</script>');
      assert.equal(sent.subject, 'A & B <b>"cita"</b>');
      assert.equal(sent.message, 'Línea 1\n<script>alert(2)</script>\n" & \' < >');
      assert.equal(JSON.stringify(sent).includes('mock-provider-secret'), false);
    });

  await t.test('rejects malformed, oversized and hostile requests before I/O',
    async () => {
      handler.resetRateLimit();
      calls = [];
      for (const body of [null, [], '{', { ...input(), extra: true },
        { ...input(), email: 'bad' }, { ...input(), email: 'a..b@example.com' },
        { ...input(), email: 'a@example.com\r\nBcc:x@example.com' },
        { ...input(), name: 'x' }, { ...input(), name: 'A\nB' },
        { ...input(), subject: 'ab' }, { ...input(), subject: 'x'.repeat(151) },
        { ...input(), subject: 'A\nB' },
        { ...input(), message: 'short' }, { ...input(), message: 'x'.repeat(5001) },
        { ...input(), website: 'bot' }, { ...input(), website: {} },
        { ...input(), requestId: 'bad' }, { ...input(), createdAt: 'now' },
        { ...input(), createdAt: Date.now() + 120000 }]) {
        assert.equal((await run(body)).code, 400);
      }
      assert.equal((await run(' '.repeat(25000))).code, 413);
      assert.equal((await run(input(), { 'content-length': '25000' })).code, 413);
      assert.equal((await run(input(), { 'content-type': 'application/jsonp' })).code, 415);
      assert.equal((await run(input(), { 'content-encoding': 'gzip' })).code, 415);
      for (const origin of [undefined, 'null', 'https://evil.example',
        'https://www.miportal.me.evil.example']) {
        assert.equal((await run(input(), { origin })).code, 403);
      }
      const method = await run(input(), {}, 'GET');
      assert.equal(method.code, 405);
      assert.equal(method.headers.Allow, 'POST');
      assert.equal((await run({ ...input(),
        createdAt: Date.now() - 24 * 3600000 })).code, 409);
      assert.equal(calls.length, 0);
    });

  await t.test('accepts localhost origins only outside Vercel', async () => {
    handler.resetRateLimit();
    calls = [];
    delete process.env.VERCEL;
    assert.equal((await run(input(), { origin: 'http://localhost:3000' })).code, 202);
    assert.equal((await run(input(), { origin: 'http://127.0.0.1:8080' })).code, 202);
    process.env.VERCEL = '1';
    assert.equal((await run(input(), { origin: 'http://localhost:3000' })).code, 403);
  });

  await t.test('works without Resend config and rejects untrusted IP', async () => {
    handler.resetRateLimit();
    calls = [];
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('RESEND_')) delete process.env[key];
    }
    assert.equal((await run()).code, 202);
    for (const ip of [undefined, 'invalid', '192.0.2.1, 192.0.2.2']) {
      assert.equal((await run(input(), { 'x-vercel-forwarded-for': ip,
        'x-forwarded-for': '192.0.2.1' })).code, 400);
    }
  });

  await t.test('in-memory rate limit returns Retry-After without sending', async () => {
    handler.resetRateLimit();
    calls = [];
    for (let i = 0; i < 6; i++) assert.equal((await run()).code, 202);
    const limited = await run();
    assert.equal(limited.code, 429);
    assert.equal(limited.headers['Retry-After'], '3600');
    assert.equal(calls.length, 6);
  });

  await t.test('provider failures are safe and do not claim success', async () => {
    for (const status of [400, 401, 403, 429, 409, 500, 503]) {
      handler.resetRateLimit();
      provider = () => reply(status, { message: 'mock-provider-secret' });
      const response = await run();
      assert.equal(response.code, 502);
      assert.equal(JSON.stringify(response).includes('mock-provider-secret'), false);
    }
    handler.resetRateLimit();
    provider = () => reply(200, {});
    assert.equal((await run()).code, 202);
  });

  await t.test('provider timeout is bounded late and maps to 504', async () => {
    handler.resetRateLimit();
    calls = [];
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = t.mock.method(AbortSignal, 'timeout', ms => {
      assert.ok(ms > 0 && ms <= 12000);
      return timeout(5);
    });
    provider = options => new Promise((resolve, reject) => {
      const keepAlive = setTimeout(resolve, 1000);
      options.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(options.signal.reason);
      }, { once: true });
    });
    assert.equal((await run()).code, 504);
    provider = () => reply(202, {});
    assert.equal((await run()).code, 202);
    spy.mock.restore();
  });
});