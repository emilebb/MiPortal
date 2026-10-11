'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const orderHandler = require('../api/digital-products/order');
const webhookHandler = require('../api/digital-products/webhook');
const mapProviderStatus = webhookHandler.mapProviderStatus;
const downloadHandler = require('../api/digital-products/download');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/PROPUESTA_20261009_productos_digitales.sql'), 'utf8');
const adminJs = fs.readFileSync(path.join(__dirname, '../js/admin/digital-products.js'), 'utf8');

const userId = '550e8400-e29b-41d4-a716-446655440000';
const productId = '650e8400-e29b-41d4-a716-446655440000';
const orderId = '750e8400-e29b-41d4-a716-446655440000';
const grantId = '850e8400-e29b-41d4-a716-446655440000';
const paymentId = '12345678901';
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function configure({ enabled = true } = {}) {
  Object.assign(process.env, {
    VERCEL: '1',
    SUPABASE_URL: 'https://miportal-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
    SUPABASE_SECRET_KEY: 'sb_secret_test_key',
    MERCADOPAGO_ACCESS_TOKEN: 'test-payment-token',
    MERCADOPAGO_WEBHOOK_SECRET: 'test-webhook-secret',
    DIGITAL_PRODUCTS_CHECKOUT_ENABLED: enabled ? 'true' : 'false'
  });
}

function request(body, headers = {}, extras = {}) {
  return {
    method: 'POST',
    url: '/api/digital-products/test',
    headers: { origin: 'https://www.miportal.me', 'content-type': 'application/json', ...headers },
    body,
    ...extras
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  global.fetch = originalFetch;
}

test('checkout apagado no crea orden ni contacta a Mercado Pago', async (t) => {
  configure({ enabled: false });
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('unexpected network call'); };
  t.after(restoreEnv);
  const res = responseRecorder();
  await orderHandler(request({ productId, idempotencyKey: '1234567890123456' }), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /todavía no está habilitada/i);
  assert.equal(calls, 0);
});

test('el SQL mantiene los RPC server-only, escrituras de pagos privadas y Storage acotado por bucket', () => {
  assert.match(sql, /revoke all on table public\.digital_products,[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on function public\.create_digital_product_order\(uuid,uuid,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_digital_product_order\(uuid,uuid,text\) to service_role/i);
  assert.match(sql, /revoke all on function public\.record_digital_product_payment\(uuid,text,text,numeric,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_digital_product_payment\(uuid,text,text,numeric,text\) to service_role/i);
  assert.match(sql, /'chargeback_won'/i);
  assert.match(sql, /when excluded\.status = 'chargeback_won' then excluded\.status/i);
  assert.match(sql, /p\.provider_payment_id<>p_payment_id[\s\S]*?p\.status in \('approved','chargeback_won'\)[\s\S]*?if v_other_approved then/i);
  assert.match(sql, /create policy digital_product_orders_owner_read[\s\S]*?user_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /create policy digital_product_payments_admin_read[\s\S]*?using \(\(select public\.is_admin\(\)\)\)/i);
  assert.match(sql, /create table public\.digital_product_payments[\s\S]*?provider_payment_id text not null unique/i);
  assert.match(sql, /create table public\.digital_product_download_grants[\s\S]*?foreign key \(order_id, user_id\)[\s\S]*?foreign key \(order_id, product_id\)[\s\S]*?foreign key \(product_id, storage_path\)/i);
  assert.match(sql, /digital_products_lock_checkout_fields[\s\S]*?before update of price, published/i);
  assert.match(sql, /hashtextextended\('digital-product:' \|\| p_product_id::text[\s\S]*?where id = p_product_id and published = true/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*update[^;]*digital_products[^;]*to service_role/i);
  assert.match(sql, /values \('miportal-digital-products','miportal-digital-products',false/i);
  assert.match(sql, /values \('miportal-product-images','miportal-product-images',true/i);
  assert.doesNotMatch(sql, /create policy[^;]*?for select to anon[^;]*?bucket_id='miportal-digital-products'/is);
  assert.match(sql, /create policy digital_product_files_admin_upload[\s\S]*?bucket_id='miportal-digital-products'[\s\S]*?public\.is_admin\(\)/i);
  const privateDeletePolicy = sql.match(/create policy digital_product_files_admin_delete[\s\S]*?;/i)?.[0] || '';
  assert.match(privateDeletePolicy, /for delete to authenticated using \([\s\S]*?bucket_id='miportal-digital-products'[\s\S]*?public\.is_admin\(\)/i);
  assert.ok(privateDeletePolicy.includes(String.raw`name !~ '\.\.'`));
  assert.doesNotMatch(sql, /create policy[^;]*?for delete to anon[^;]*?bucket_id='miportal-digital-products'/is);
  assert.match(sql, /create policy digital_product_images_admin_insert[\s\S]*?bucket_id='miportal-product-images'[\s\S]*?public\.is_admin\(\)/i);
  assert.match(adminJs, /storage\.from\(bucket\)\.remove\(\[path\]\)/);
  assert.match(adminJs, /cleanupFailed[\s\S]*?Storage no confirmó la limpieza/i);
  assert.doesNotMatch(sql, /public\.payments|record_pro_payment|create table public\.payments/i);
});

test('mapea disputas y resoluciones de contracargo según el estado autoritativo de Mercado Pago', () => {
  assert.equal(mapProviderStatus('approved'), 'approved');
  assert.equal(mapProviderStatus('cancelled'), 'cancelled');
  assert.equal(mapProviderStatus('rejected'), 'rejected');
  assert.equal(mapProviderStatus('refunded'), 'refunded');
  assert.equal(mapProviderStatus('in_mediation'), 'charged_back');
  assert.equal(mapProviderStatus('charged_back', 'in_process'), 'charged_back');
  assert.equal(mapProviderStatus('charged_back', 'reimbursed'), 'charged_back');
  assert.equal(mapProviderStatus('charged_back', 'settled'), 'chargeback_won');
});

test('la URL de pago debe pertenecer exactamente a la preferencia y orden guardadas', () => {
  const { checkoutUrl } = orderHandler;
  assert.equal(checkoutUrl({ id: 'pref-123', external_reference: orderId, init_point: 'https://www.mercadopago.com.co/checkout/a' }, 'pref-123', orderId), 'https://www.mercadopago.com.co/checkout/a');
  assert.equal(checkoutUrl({ id: 'pref-other', external_reference: orderId, init_point: 'https://www.mercadopago.com.co/checkout/a' }, 'pref-123', orderId), null);
  assert.equal(checkoutUrl({ id: 'pref-123', external_reference: '950e8400-e29b-41d4-a716-446655440000', init_point: 'https://www.mercadopago.com.co/checkout/a' }, 'pref-123', orderId), null);
  assert.equal(checkoutUrl({ id: 'pref-123', external_reference: orderId, init_point: 'https://attacker.example/checkout' }, 'pref-123', orderId), null);
});

test('order valida Auth y usa precio/moneda/nombre devueltos por la base', async (t) => {
  configure();
  t.after(restoreEnv);
  const seen = [];
  let orderCalls = 0;
  global.fetch = async (url, options = {}) => {
    const address = String(url);
    seen.push({ address, options });
    if (address.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
    if (address.endsWith('/rpc/create_digital_product_order')) {
      orderCalls += 1;
      const payload = JSON.parse(options.body);
      assert.equal(payload.p_user_id, userId);
      assert.equal(payload.p_product_id, productId);
      assert.equal(payload.p_idempotency_key, '1234567890123456');
      return jsonResponse({ order_id: orderId, status: 'pending', total: 12999, currency: 'COP', product_id: productId, product_name: 'Producto real', provider_preference_id: orderCalls > 1 ? 'pref-123' : null });
    }
    if (address === 'https://api.mercadopago.com/checkout/preferences' && options.method === 'POST') {
      const preference = JSON.parse(options.body);
      assert.equal(preference.items[0].unit_price, 12999);
      assert.equal(preference.items[0].title, 'Producto real');
      assert.equal(preference.external_reference, orderId);
      assert.equal(preference.back_urls.failure, `https://www.miportal.me/productos.html?payment=failed&product=${productId}`);
      assert.match(options.headers['X-Idempotency-Key'], new RegExp(orderId));
      assert.equal(preference.notification_url, 'https://www.miportal.me/api/digital-products/webhook');
      return jsonResponse({ id: 'pref-123', external_reference: orderId, init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123' });
    }
    if (address === 'https://api.mercadopago.com/checkout/preferences/pref-123') {
      assert.equal(options.method, 'GET');
      return jsonResponse({ id: 'pref-123', external_reference: orderId, init_point: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123' });
    }
    if (address.endsWith('/rpc/set_digital_product_preference')) return jsonResponse(true);
    throw new Error('unexpected URL');
  };
  const results = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = responseRecorder();
    await orderHandler(request({
      productId, idempotencyKey: '1234567890123456', price: 1, user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    }, { authorization: 'Bearer user-session-token-for-tests-1234567890' }), res);
    assert.equal(res.statusCode, 200);
    results.push(res.body);
  }
  assert.deepEqual(results[0], { orderId, status: 'pending', initPoint: 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-123' });
  assert.deepEqual(results[1], results[0]);
  const preferences = seen.filter((call) => call.address.includes('/checkout/preferences'));
  assert.equal(preferences.filter((call) => call.options.method === 'POST').length, 1);
  assert.equal(preferences.filter((call) => call.options.method === 'GET').length, 1);
  assert.equal(preferences.find((call) => call.options.method === 'POST').options.headers['X-Idempotency-Key'], `digital-product-order-${orderId}`);
});

test('checkout sin token no crea órdenes ni preferencias', async (t) => {
  configure();
  t.after(restoreEnv);
  let preferenceCalls = 0;
  global.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ message: 'invalid token' }, 401);
    if (String(url).includes('/checkout/preferences')) preferenceCalls += 1;
    throw new Error('unexpected request');
  };
  const res = responseRecorder();
  await orderHandler(request({ productId, idempotencyKey: '1234567890123456' }, { authorization: 'Bearer invalid-token-12345678901234567890' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(preferenceCalls, 0);
});

test('webhook rechaza firma inválida antes de consultar Mercado Pago', async (t) => {
  configure();
  t.after(restoreEnv);
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('unexpected network call'); };
  const res = responseRecorder();
  await webhookHandler(request({ type: 'payment', data: { id: paymentId } }, {
    'x-request-id': 'test-req', 'x-signature': 'ts=1,v1=deadbeef'
  }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls, 0);
});

test('webhook consulta el pago real y entrega al RPC solo sus datos verificados', async (t) => {
  configure();
  t.after(restoreEnv);
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = 'request-123';
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const signature = createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
  const seen = [];
  global.fetch = async (url, options = {}) => {
    const address = String(url);
    seen.push({ address, options });
    if (address === `https://api.mercadopago.com/v1/payments/${paymentId}`) {
      assert.equal(options.method, 'GET');
      return jsonResponse({ id: Number(paymentId), external_reference: orderId, status: 'approved', transaction_amount: 12999, currency_id: 'COP' });
    }
    if (address.endsWith('/rpc/record_digital_product_payment')) {
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload, { p_order_id: orderId, p_payment_id: paymentId, p_status: 'approved', p_amount: 12999, p_currency: 'COP' });
      return jsonResponse({ accepted: true, order_status: 'paid' });
    }
    throw new Error('unexpected URL');
  };
  const webhookRequest = request({ type: 'payment', action: 'payment.updated', data: { id: paymentId } }, {
    'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}`
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = responseRecorder();
    await webhookHandler(webhookRequest, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
  }
  assert.equal(seen.filter((call) => call.address.startsWith('https://api.mercadopago.com/')).length, 2);
  const paymentRecords = seen.filter((call) => call.address.endsWith('/rpc/record_digital_product_payment'));
  assert.equal(paymentRecords.length, 2);
  assert.ok(paymentRecords.every((call) => JSON.parse(call.options.body).p_payment_id === paymentId));
});

test('descarga requiere sesión y emite un enlace firmado temporal solo para el grant consultado', async (t) => {
  configure();
  t.after(restoreEnv);
  const seen = [];
  global.fetch = async (url, options = {}) => {
    const address = String(url);
    seen.push({ address, options });
    if (address.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
    if (address.endsWith('/rpc/get_digital_download_grant')) {
      assert.deepEqual(JSON.parse(options.body), { p_grant_id: grantId, p_user_id: userId });
      return jsonResponse({ id: grantId, product_id: productId, storage_path: `${productId}/file-123.zip`, original_filename: 'entrega.zip' });
    }
    if (address.includes('/storage/v1/object/sign/miportal-digital-products/')) {
      assert.equal(JSON.parse(options.body).expiresIn, 60);
      assert.equal(JSON.parse(options.body).download, undefined);
      return jsonResponse({ signedURL: `/object/sign/miportal-digital-products/${productId}/file-123.zip?token=temporary` });
    }
    throw new Error('unexpected URL');
  };
  const res = responseRecorder();
  await downloadHandler(request({ grantId }, { authorization: 'Bearer user-session-token-for-tests-1234567890' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.expiresIn, 60);
  assert.equal(new URL(res.body.downloadUrl).origin, 'https://miportal-test.supabase.co');
  assert.match(res.body.downloadUrl, /download=entrega\.zip/);
  assert.equal(seen.length, 3);
});

test('descarga sin una identidad verificada no crea signed URL', async (t) => {
  configure();
  t.after(restoreEnv);
  let signedUrlCalls = 0;
  global.fetch = async (url) => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse({}, 401);
    if (String(url).includes('/storage/v1/object/sign/')) signedUrlCalls += 1;
    throw new Error('unexpected request');
  };
  const res = responseRecorder();
  await downloadHandler(request({ grantId }, { authorization: 'Bearer invalid-token-for-user-123456789012' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(signedUrlCalls, 0);
});

test('descarga rechaza una ruta que no pertenece al producto del grant', async (t) => {
  configure();
  t.after(restoreEnv);
  let signedUrlCalls = 0;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.endsWith('/auth/v1/user')) return jsonResponse({ id: userId });
    if (address.endsWith('/rpc/get_digital_download_grant')) {
      return jsonResponse({ id: grantId, product_id: productId, storage_path: '950e8400-e29b-41d4-a716-446655440000/foreign.zip', original_filename: 'foreign.zip' });
    }
    if (address.includes('/storage/v1/object/sign/')) signedUrlCalls += 1;
    throw new Error('unexpected network call');
  };
  const res = responseRecorder();
  await downloadHandler(request({ grantId }, { authorization: 'Bearer user-session-token-for-tests-1234567890' }), res);
  assert.equal(res.statusCode, 404);
  assert.equal(signedUrlCalls, 0);
});
