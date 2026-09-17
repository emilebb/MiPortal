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
  json: async () => body
});
function run(req = {}) {
  const res = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  return handler({ method: 'POST', url: '/api/newsletter', headers: {
    origin: 'https://www.miportal.me', 'content-type': 'application/json',
    'x-vercel-forwarded-for': '192.0.2.1'
  }, body: { email: 'reader@example.test', website: '' }, ...req }, res)
    .then(() => res);
}

test('newsletter API uses mocked Supabase RPC and Resend only', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
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
  assert.match(accepted.body.message, /correo|confirm/i);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].payload.p_sender_hash.length, 64);
  assert.equal(calls[1].payload.p_email, 'reader@example.test');
  assert.deepEqual(calls[2].payload.to, ['reader@example.test']);
  assert.match(calls[2].payload.text, /action=confirm/);
  assert.match(calls[2].payload.text, /action=unsubscribe/);

  const confirmUrl = calls[2].payload.text.match(/https:\/\/www\.miportal\.me\/api\/newsletter\?action=confirm[^\n]+/)[0];
  const confirmed = await run({ method: 'GET', url: new URL(confirmUrl).pathname + new URL(confirmUrl).search });
  assert.equal(confirmed.code, 200);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].payload.p_status, 'confirmed');
});

test('newsletter API rejects invalid origins, honeypot and missing config before provider calls', async t => {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
  t.mock.method(global, 'fetch', async () => { throw new Error('network must not run'); });
  assert.equal((await run({ headers: { origin: 'https://evil.example' } })).code, 403);
  assert.equal((await run({ body: { email: 'reader@example.test', website: 'bot' } })).code, 400);
  delete process.env.NEWSLETTER_HASH_SECRET;
  assert.equal((await run()).code, 503);
});
