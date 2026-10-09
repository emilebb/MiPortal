const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/assistant');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('assistant proxy validates the contract before calling n8n', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('must not call upstream'); };
  try {
    for (const body of [[], {}, { message: 42 }, { message: '' }, { message: '   ' }, { message: 'x'.repeat(1001) }]) {
      const res = responseRecorder();
      await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(typeof res.body.reply, 'string');
      assert.ok(Array.isArray(res.body.links));
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
    assert.equal(called, false);
  } finally { global.fetch = originalFetch; }
});

test('assistant proxy forwards valid messages and preserves the response contract', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  process.env.N8N_ASSISTANT_WEBHOOK_SECRET = 'test-only-secret-value-that-is-long-enough';
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { status: 200, ok: true, json: async () => ({ reply: 'Hola', links: [{ label: 'Inicio', url: '/' }] }) };
  };
  try {
    const res = responseRecorder();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: {
      message: '  Hola  ', sessionId: 'ephemeral', page: { path: '/', title: 'Home' }
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(request.url, 'https://n8n.miportal.me/webhook/miportal-assistant');
    assert.deepEqual(JSON.parse(request.options.body), {
      message: 'Hola', sessionId: 'ephemeral', page: { path: '/', title: 'Home' }
    });
    assert.equal(request.options.headers['X-MiPortal-Assistant-Secret'], process.env.N8N_ASSISTANT_WEBHOOK_SECRET);
    assert.deepEqual(res.body, { reply: 'Hola', links: [{ label: 'Inicio', url: '/' }] });
  } finally {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
    else process.env.N8N_ASSISTANT_WEBHOOK_SECRET = originalSecret;
  }
});

test('assistant proxy fails closed when the shared n8n credential is missing', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  delete process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('must not call upstream'); };
  try {
    const res = responseRecorder();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { message: 'Hola' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
    if (originalSecret !== undefined) process.env.N8N_ASSISTANT_WEBHOOK_SECRET = originalSecret;
  }
});

test('assistant proxy rejects unsupported methods and content types', async () => {
  let res = responseRecorder();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
  res = responseRecorder();
  await handler({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }, res);
  assert.equal(res.statusCode, 415);
});

test('assistant proxy limits a conversation to five requests per session and reports Retry-After', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  process.env.N8N_ASSISTANT_WEBHOOK_SECRET = 'test-only-secret-value-that-is-long-enough';
  global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ reply: 'OK', links: [] }) });
  handler.resetRateLimitsForTests();
  try {
    for (let index = 0; index < 5; index++) {
      const res = responseRecorder();
      await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.40' }, body: { message: 'Hola', sessionId: 'same-session' } }, res);
      assert.equal(res.statusCode, 200);
    }
    const res = responseRecorder();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.40' }, body: { message: 'Siguiente', sessionId: 'same-session' } }, res);
    assert.equal(res.statusCode, 429);
    assert.ok(Number(res.headers['Retry-After']) > 0);
    assert.deepEqual(res.body.links, []);
  } finally {
    handler.resetRateLimitsForTests();
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
    else process.env.N8N_ASSISTANT_WEBHOOK_SECRET = originalSecret;
  }
});

test('assistant proxy caps requests per IP and sanitizes forwarded page metadata', async () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
  process.env.N8N_ASSISTANT_WEBHOOK_SECRET = 'test-only-secret-value-that-is-long-enough';
  let forwarded;
  global.fetch = async (_url, options) => {
    forwarded = JSON.parse(options.body);
    return { status: 200, ok: true, json: async () => ({ reply: 'OK', links: [] }) };
  };
  handler.resetRateLimitsForTests();
  try {
    const first = responseRecorder();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.41' }, body: {
      message: 'Hola', sessionId: 'session-1', page: { path: '//evil.example', title: 'x'.repeat(200), extra: 'ignored' }
    } }, first);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(forwarded, { message: 'Hola', sessionId: 'session-1', page: { title: 'x'.repeat(120) } });

    for (let index = 1; index <= 5; index++) {
      const res = responseRecorder();
      await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.42' }, body: { message: 'Hola', sessionId: `session-${index}` } }, res);
      assert.equal(res.statusCode, 200);
    }
    const blocked = responseRecorder();
    await handler({ method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.42' }, body: { message: 'Hola', sessionId: 'session-final' } }, blocked);
    assert.equal(blocked.statusCode, 429);
  } finally {
    handler.resetRateLimitsForTests();
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.N8N_ASSISTANT_WEBHOOK_SECRET;
    else process.env.N8N_ASSISTANT_WEBHOOK_SECRET = originalSecret;
  }
});
