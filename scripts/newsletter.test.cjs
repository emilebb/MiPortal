const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/newsletter');

const config = {
  SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'mock-db-secret',
  NEWSLETTER_HASH_SECRET: 'test-only-newsletter-secret-at-least-32-characters',
  RESEND_API_KEY: 'mock-provider-secret', RESEND_FROM_EMAIL: 'newsletter@example.test',
  VERCEL: '1'
};
const response = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});
function run(req = {}) {
  const res = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  const { headers: reqHeaders, ...rest } = req;
  const headers = {
    origin: 'https://www.miportal.me', 'content-type': 'application/json',
    'x-vercel-forwarded-for': '192.0.2.1', ...(reqHeaders || {})
  };
  return handler({ method: 'POST', url: '/api/newsletter', headers,
    body: { email: 'reader@example.test', website: '' }, ...rest }, res)
    .then(() => res);
}
function withEnv(t) {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
}
function blockingFetch() {
  return t => t.mock.method(global, 'fetch', async () => {
    throw new Error('network must not run');
  });
}

test('newsletter API uses mocked Supabase RPC and Resend only', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options, payload: JSON.parse(options.body) });
    if (url.includes('/reserve_newsletter_attempt')) return response(200, { allowed: true });
    if (url.includes('/upsert_newsletter_subscriber')) return response(200, { status: 'pending' });
    if (url.includes('/update_newsletter_status')) return response(200, true);
    assert.equal(url, 'https://api.resend.com/emails');
    return response(200, { id: 'mock-email-id' });
  });

  const accepted = await run();
  assert.equal(accepted.code, 202);
  assert.match(accepted.body.message, /¡Gracias! Te has suscrito correctamente/);
  assert.match(accepted.body.message, /correo|confirm/i);
  assert.equal(JSON.stringify(accepted).includes('mock-provider-secret'), false);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].payload.p_sender_hash.length, 64);
  assert.equal(calls[1].payload.p_email, 'reader@example.test');
  assert.deepEqual(calls[2].payload.to, ['reader@example.test']);
  assert.equal(calls[2].payload.subject, '¡Bienvenido a MiPortal! 🎉');
  assert.equal(calls[2].payload.from, 'MiPortal <newsletter@example.test>');
  assert.equal(typeof calls[2].payload.html, 'string');
  assert.match(calls[2].payload.html, /Bienvenido a MiPortal/);
  assert.match(calls[2].payload.html, /VISITAR MIPORTAL/);
  assert.match(calls[2].payload.html, /action=confirm/);
  assert.match(calls[2].payload.html, /action=unsubscribe/);
  assert.equal(calls[2].payload.html.includes('mock-provider-secret'), false);
  assert.match(calls[2].payload.text, /action=confirm/);
  assert.match(calls[2].payload.text, /action=unsubscribe/);

  const confirmUrl = calls[2].payload.text.match(/https:\/\/www\.miportal\.me\/api\/newsletter\?action=confirm[^\n]+/)[0];
  const confirmed = await run({ method: 'GET', url: new URL(confirmUrl).pathname + new URL(confirmUrl).search });
  assert.equal(confirmed.code, 200);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].payload.p_status, 'confirmed');
});

test('newsletter API reports already confirmed subscriptions with the exact success message', async t => {
  withEnv(t);
  t.mock.method(global, 'fetch', async url => {
    if (url.includes('/reserve_newsletter_attempt')) return response(200, { allowed: true });
    if (url.includes('/upsert_newsletter_subscriber')) return response(200, { status: 'confirmed' });
    return response(200, { id: 'mock-email-id' });
  });
  const accepted = await run();
  assert.equal(accepted.code, 202);
  assert.equal(accepted.body.message, '¡Gracias! Te has suscrito correctamente.');
});

test('newsletter API rejects hostile requests before any provider call', async t => {
  withEnv(t);
  blockingFetch()(t);
  assert.equal((await run({ headers: { origin: 'https://evil.example' } })).code, 403);
  assert.equal((await run({ headers: { origin: undefined } })).code, 403);
  assert.equal((await run({ body: { email: 'reader@example.test', website: 'bot' } })).code, 400);
  for (const body of [null, [], '{', { email: '' }, { email: 'bad' },
    { email: 'a@example.com', extra: true }, { email: 'a..b@example.com' },
    { email: 'a@.example.com' }, { email: '\r\nBcc:x@example.com' }, { website: '' }]) {
    assert.equal((await run({ body })).code, 400);
  }
  assert.equal((await run({ body: ' '.repeat(5000) })).code, 413);
  assert.equal((await run({ headers: { 'content-type': 'application/jsonp' } })).code, 415);
  const method = await run({ method: 'PUT' });
  assert.equal(method.code, 405);
  assert.equal(method.headers.Allow, 'GET, POST');
});

test('newsletter API fails closed with precise codes and logs for missing config', async t => {
  withEnv(t);
  blockingFetch()(t);
  const logs = [];
  const spy = t.mock.method(console, 'error', line => logs.push(String(line)));
  for (const key of Object.keys(config)) {
    if (key === 'VERCEL') continue;
    delete process.env[key];
    const result = await run({ url: '/api/newsletter?action=confirm&token=abc' });
    assert.equal(result.code, 500, key);
    assert.match(logs.at(-1), /Configuración incompleta/);
    assert.match(logs.at(-1), new RegExp(key));
    process.env[key] = config[key];
  }
  delete process.env.NEWSLETTER_HASH_SECRET;
  const get = await run({ method: 'GET', url: '/api/newsletter?action=confirm&token=abc' });
  assert.equal(get.code, 500);
  assert.match(logs.at(-1), /GET: configuración incompleta/);
  assert.equal(JSON.stringify(logs).includes('mock-db-secret'), false);
  assert.equal(JSON.stringify(logs).includes('mock-provider-secret'), false);
  spy.mock.restore();
});

test('newsletter API rate limit returns Retry-After without sending', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push(url);
    if (/reserve_newsletter_attempt/.test(url)) return response(200, { allowed: false });
    return response(200, { id: 'mock-email-id' });
  });
  const limited = await run();
  assert.equal(limited.code, 429);
  assert.equal(limited.headers['Retry-After'], '3600');
  assert.equal(JSON.stringify(limited).includes('mock-provider-secret'), false);
  assert.deepEqual(calls, ['https://example.test/rest/v1/rpc/reserve_newsletter_attempt']);
});

test('newsletter API maps upstream and provider failures to specific codes', async t => {
  withEnv(t);
  const cases = [
    { rpc: response(404, 'Could not find the function public.upsert_newsletter_subscriber'), expected: 502, saved: false },
    { rpc: response(503, { message: 'service unavailable' }), expected: 503, saved: false },
    { rpc: response(200, { allowed: true }), resend: response(401, { message: 'mock-provider-secret' }), expected: 202, saved: true },
    { rpc: response(200, { allowed: true }), resend: response(429, { message: 'rate limited' }), expected: 202, saved: true },
    { rpc: response(200, { allowed: true }), resend: response(200, {}), expected: 202, saved: true }
  ];
  for (const testCase of cases) {
    const calls = [];
    t.mock.method(global, 'fetch', async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/reserve_newsletter_attempt')) return testCase.rpc ?? response(200, { allowed: true });
      if (url.includes('/upsert_newsletter_subscriber')) return testCase.rpc ?? response(200, { status: 'pending' });
      if (testCase.resend) return testCase.resend;
      return response(200, { id: 'mock-email-id' });
    });
    const result = await run();
    assert.equal(result.code, testCase.expected);
    assert.equal(JSON.stringify(result).includes('mock-provider-secret'), false);
    if (testCase.saved) {
      assert.match(result.body.message, /suscrito correctamente/);
    } else {
      assert.equal(result.body.error, 'El servicio de suscripción está momentáneamente no disponible. Inténtalo más tarde.');
    }
  }
});

test('newsletter API keeps a registered subscription when the welcome email fails', async t => {
  withEnv(t);
  const logs = [];
  const spy = t.mock.method(console, 'error', line => logs.push(String(line)));
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/reserve_newsletter_attempt')) return response(200, { allowed: true });
    if (url.includes('/upsert_newsletter_subscriber')) return response(200, { status: 'pending' });
    return response(429, { statusCode: 429, message: 'You have exceeded the rate limit. mock-provider-secret', name: 'RateLimitError' });
  });
  const result = await run();
  assert.equal(result.code, 202);
  assert.match(result.body.message, /suscrito correctamente/);
  assert.equal(JSON.stringify(result).includes('mock-provider-secret'), false);
  assert.match(logs.at(-1), /Resend/);
  assert.equal(JSON.stringify(logs).includes('mock-provider-secret'), false);
  assert.equal(String(logs.at(-1)).includes('mock-provider-secret'), false);
  assert.ok(String(logs.at(-1)).includes('***'));
  spy.mock.restore();
});

test('newsletter API timeout returns 504 and never leaks secrets to logs', async t => {
  withEnv(t);
  const logs = [];
  const spy = t.mock.method(console, 'error', line => logs.push(String(line)));
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', ms => timeout(5));
  t.mock.method(global, 'fetch', async (url, options) => {
    if (url.includes('/reserve_newsletter_attempt')) return response(200, { allowed: true });
    return new Promise((resolve, reject) => {
      const keepAlive = setTimeout(resolve, 1000);
      options.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(options.signal.reason);
      }, { once: true });
    });
  });
  const result = await run();
  assert.equal(result.code, 504);
  assert.equal(JSON.stringify(logs).includes('mock-provider-secret'), false);
  assert.equal(JSON.stringify(logs).includes('mock-db-secret'), false);
  spy.mock.restore();
});