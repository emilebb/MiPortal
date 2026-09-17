const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact');

const input = () => ({
  name: 'Prueba local', email: 'test@example.com',
  message: 'Mensaje ficticio de prueba.', website: '',
  requestId: 'da287f3e-669e-4f10-9640-f987e23a9f40', createdAt: Date.now()
});
const config = {
  SUPABASE_URL: 'https://example.test', SUPABASE_SECRET_KEY: 'mock-db-secret',
  CONTACT_HASH_SECRET: 'test-only-hash-secret-at-least-32-characters',
  RESEND_API_KEY: 'mock-provider-secret', RESEND_FROM_EMAIL: 'contact@example.test',
  CONTACT_TO_EMAIL: 'emile.123455@gmail.com', VERCEL: '1'
};
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

test('contact API uses mocked RPC and Resend exclusively', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
  let calls = [];
  let rpc = () => reply(200, { allowed: true, retry_after: 0 });
  let provider = () => reply(200, { id: 'mock-email-id' });
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, ...options, payload: JSON.parse(options.body) });
    if (url === 'https://example.test/rest/v1/rpc/reserve_contact_attempt') {
      return rpc(options);
    }
    assert.equal(url, 'https://api.resend.com/emails');
    return provider(options);
  });
  await t.test('acceptance, server recipient, reply_to, hashes and no queue', async () => {
    const body = input();
    assert.equal((await run(body)).code, 202);
    assert.match((await run(body)).body.message, /aceptado/i);
    const [limit, mail] = calls;
    assert.deepEqual(Object.keys(limit.payload).sort(),
      ['p_email_hash', 'p_sender_hash']);
    assert.match(limit.payload.p_sender_hash, /^[a-f0-9]{64}$/);
    assert.match(limit.payload.p_email_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(limit.payload).includes('192.0.2.1'), false);
    assert.equal(JSON.stringify(limit.payload).includes(body.email), false);
    assert.equal(mail.payload.from, config.RESEND_FROM_EMAIL);
    assert.deepEqual(mail.payload.to, [config.CONTACT_TO_EMAIL]);
    assert.equal(mail.payload.reply_to, body.email);
    assert.equal(mail.payload.html, undefined);
    assert.match(mail.payload.text, /Mensaje ficticio/);
    assert.equal(mail.headers['Idempotency-Key'], calls[3].headers['Idempotency-Key']);
    assert.match(mail.headers['Idempotency-Key'], /^contact\/[a-f0-9]{64}$/);
    assert.equal(mail.signal.aborted, false);
  });
  await t.test('rejects malformed, oversized and hostile requests before I/O', async () => {
    calls = [];
    for (const body of [null, [], '{', { ...input(), extra: true },
      { ...input(), email: 'bad' }, { ...input(), email: 'a..b@example.com' },
      { ...input(), email: 'a@example.com\r\nBcc:x@example.com' },
      { ...input(), name: 'x' }, { ...input(), name: 'A\nB' },
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
  await t.test('fails closed for missing config and untrusted IP', async () => {
    calls = [];
    for (const key of Object.keys(config)) {
      delete process.env[key];
      assert.equal((await run()).code, 503, key);
      process.env[key] = config[key];
    }
    process.env.RESEND_FROM_EMAIL = 'Unverified <test@resend.dev>';
    assert.equal((await run()).code, 503);
    process.env.RESEND_FROM_EMAIL = config.RESEND_FROM_EMAIL;
    for (const ip of [undefined, 'invalid', '192.0.2.1, 192.0.2.2']) {
      assert.equal((await run(input(), { 'x-vercel-forwarded-for': ip,
        'x-forwarded-for': '192.0.2.1' })).code, 503);
    }
    assert.equal(calls.length, 0);
  });
  await t.test('persistent rate limit returns Retry-After without sending', async () => {
    calls = [];
    rpc = () => reply(200, { allowed: false, retry_after: 3600 });
    const response = await run();
    assert.equal(response.code, 429);
    assert.equal(response.headers['Retry-After'], '3600');
    assert.equal(calls.length, 1);
  });
  await t.test('RPC outage or invalid result never reaches provider', async () => {
    for (const result of [reply(500, { message: 'mock-db-secret' }),
      reply(200, null), reply(200, {}), reply(200, { allowed: 'true' })]) {
      calls = [];
      rpc = () => result;
      const response = await run();
      assert.equal(response.code, 503);
      assert.equal(calls.length, 1);
      assert.equal(JSON.stringify(response).includes('mock-db-secret'), false);
    }
    rpc = () => { throw new Error('mock-db-secret'); };
    assert.equal((await run()).code, 503);
    rpc = () => reply(200, { allowed: true, retry_after: 0 });
  });
  await t.test('provider failures are safe and do not claim success', async () => {
    for (const status of [400, 401, 403, 422, 500, 503]) {
      provider = () => reply(status, { message: 'mock-provider-secret' });
      const response = await run();
      assert.equal(response.code, 502);
      assert.equal(JSON.stringify(response).includes('mock-provider-secret'), false);
    }
    provider = () => reply(200, {});
    assert.equal((await run()).code, 502);
    provider = () => reply(429, {}, { 'Retry-After': '120' });
    const limited = await run();
    assert.equal(limited.code, 429);
    assert.equal(limited.headers['Retry-After'], '120');
    provider = () => reply(409, { name: 'concurrent_idempotent_requests' });
    assert.equal((await run()).code, 409);
  });
  await t.test('provider timeout is bounded and retry keeps idempotency', async () => {
    calls = [];
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const spy = t.mock.method(AbortSignal, 'timeout', ms => {
      assert.ok(ms > 0 && ms <= 8000);
      return timeout(5);
    });
    provider = options => new Promise((resolve, reject) => {
      const keepAlive = setTimeout(resolve, 1000);
      options.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(options.signal.reason);
      }, { once: true });
    });
    const body = input();
    const response = await run(body);
    assert.equal(response.code, 504);
    provider = () => reply(200, { id: 'mock-email-id' });
    assert.equal((await run(body)).code, 202);
    assert.equal(calls[1].headers['Idempotency-Key'],
      calls[3].headers['Idempotency-Key']);
    spy.mock.restore();
  });
});
