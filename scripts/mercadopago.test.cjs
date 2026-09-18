const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const preferenceHandler = require('../api/mp-preference');
const webhookHandler = require('../api/webhook-mercadopago');

const config = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'mock-db-secret',
  MERCADOPAGO_ACCESS_TOKEN: 'TEST-mock-access-token',
  MERCADOPAGO_WEBHOOK_SECRET: 'webhook-secret-for-tests-at-least-32-chars',
  VERCEL: '1'
};
const userId = '11111111-2222-4333-8444-555555555555';
const mpPaymentId = '123456789';
const planAmount = 19999;

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

function run(handler, req = {}) {
  const res = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  return handler(req, res).then(() => res);
}

function withEnv(t) {
  const saved = { ...process.env };
  Object.assign(process.env, config);
  t.after(() => { process.env = saved; });
}

function webhookRequest(paymentId, overrides = {}) {
  const base = { type: 'payment', data: { id: paymentId }, date_created: new Date().toISOString() };
  return { method: 'POST', url: '/api/webhook-mercadopago', headers: {}, body: { ...base, ...overrides } };
}

function paymentPayload(id) {
  return {
    id, status: 'approved', status_detail: 'accredited',
    transaction_amount: planAmount, currency_id: 'COP',
    external_reference: userId
  };
}

test('mp-preference crea el Checkout Pro con external_reference = user_id', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options, payload: JSON.parse(options.body) });
    return response(200, { init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref-id=xyz' });
  });

  const result = await run(preferenceHandler, {
    method: 'POST', url: '/api/mp-preference',
    headers: { origin: 'https://www.miportal.me', 'content-type': 'application/json' },
    body: { user_id: userId }
  });

  assert.equal(result.code, 200);
  assert.match(result.body.init_point, /^https:\/\/www\.mercadopago\.com\.co/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].url, 'https://api.mercadopago.com/checkout/preferences');
  assert.equal(calls[0].payload.external_reference, userId);
  assert.equal(calls[0].payload.items[0].unit_price, planAmount);
  assert.equal(calls[0].payload.items[0].currency_id, 'COP');
  assert.equal(calls[0].payload.notification_url,
    'https://www.miportal.me/api/webhook-mercadopago');
  assert.equal(calls[0].payload.back_urls.success,
    'https://www.miportal.me/gracias-pro.html');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer TEST-mock-access-token');
});

test('mp-preference rechaza origen ajeno, mal JSON y user_id inválido', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async () => response(200, { init_point: 'x' }));

  const evilOrigin = await run(preferenceHandler, {
    method: 'POST', url: '/api/mp-preference',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: { user_id: userId }
  });
  assert.equal(evilOrigin.code, 403);

  const badBody = await run(preferenceHandler, {
    method: 'POST', url: '/api/mp-preference',
    headers: { origin: 'https://www.miportal.me', 'content-type': 'application/json' },
    body: { user_id: 'no-soy-un-uuid' }
  });
  assert.equal(badBody.code, 400);

  const getMethod = await run(preferenceHandler, {
    method: 'GET', url: '/api/mp-preference', headers: {}
  });
  assert.equal(getMethod.code, 405);
  assert.equal(calls.length, 0);
});

test('webhook aprobado valida firma, re-consulta el pago y otorga el rol pro', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push(url);
    if (url.includes('/v1/payments/')) return response(200, paymentPayload(mpPaymentId));
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/record_pro_payment');
    assert.equal(JSON.parse(options.body).p_user_id, userId);
    assert.equal(JSON.parse(options.body).p_payment_id, mpPaymentId);
    assert.equal(JSON.parse(options.body).p_amount, planAmount);
    assert.equal(JSON.parse(options.body).p_currency, 'COP');
    return response(200, { payment_registered: true, profile_upgraded: true });
  });

  const manifest = `id:${mpPaymentId};request-id:req-123;ts:1700000000;`;
  const v1 = createHmac('sha256', config.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
  const result = await run(webhookHandler, {
    ...webhookRequest(mpPaymentId),
    headers: { 'x-signature': `ts=1700000000;v1=${v1}`, 'x-request-id': 'req-123' }
  });

  assert.equal(result.code, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/v1\/payments\/123456789$/);
});

test('webhook rechaza firma inválida antes de consultar Mercado Pago', async t => {
  withEnv(t);
  const calls = [];
  t.mock.method(global, 'fetch', async () => { calls.push('network'); return response(200, {}); });

  const result = await run(webhookHandler, {
    ...webhookRequest(mpPaymentId),
    headers: { 'x-signature': 'ts=1700000000;v1=deadbeef', 'x-request-id': 'req-123' }
  });

  assert.equal(result.code, 401);
  assert.equal(calls.length, 0);
});

test('webhook no otorga el rol si el pago no está aprobado o no coincide el plan', async t => {
  withEnv(t);
  process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => {
    calls.push(url);
    if (url.includes('/record_pro_payment')) return response(200, {});
    return response(200, {
      id: mpPaymentId, status: 'rejected', status_detail: 'rejected',
      transaction_amount: planAmount, currency_id: 'COP', external_reference: userId
    });
  });

  const result = await run(webhookHandler, webhookRequest(mpPaymentId));
  assert.equal(result.code, 200);
  assert.equal(calls.some(u => u.includes('/record_pro_payment')), false);
});

test('webhook ignora notificaciones que no son de pago', async t => {
  withEnv(t);
  process.env.MERCADOPAGO_WEBHOOK_SECRET = '';
  const calls = [];
  t.mock.method(global, 'fetch', async () => { calls.push('network'); return response(200, {}); });

  const result = await run(webhookHandler, {
    method: 'POST', url: '/api/webhook-mercadopago', headers: {},
    body: { type: 'plan', data: { id: 'x' } }
  });
  assert.equal(result.code, 200);
  assert.equal(calls.length, 0);
});