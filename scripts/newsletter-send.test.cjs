// Tests de api/newsletter-send.js + lib/newsletter-dispatch.js.
// Corren sin red: toda la red la simula t.mock.method(global, 'fetch').
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/newsletter-send');
const dispatchLib = require('../lib/newsletter-dispatch');

const UUID_ADMIN = '00000000-0000-4000-8000-000000000001';
const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DISPATCH_ID = '22222222-2222-4222-8222-222222222222';

const config = {
  SUPABASE_URL: 'https://example.test',
  SUPABASE_SECRET_KEY: 'mock-db-secret',
  NEWSLETTER_HASH_SECRET: 'test-only-newsletter-secret-at-least-32-characters',
  RESEND_API_KEY: 'mock-provider-secret',
  RESEND_FROM_EMAIL: 'newsletter@example.test',
  NEWSLETTER_BATCH_DELAY_MS: '1',
  NEWSLETTER_RETRY_BACKOFF_MS: '1'
};

function withEnv(t, overrides = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, { ...config, ...overrides });
  t.after(() => { process.env = saved; });
}

const response = (status, body, headers) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => (headers && headers[name]) ?? null },
  json: async () => body,
  text: async () => typeof body === 'string' ? body : JSON.stringify(body)
});

function run(req = {}, reqBody = {}) {
  const res = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  const { headers: reqHeaders, ...rest } = req;
  const headers = {
    origin: 'https://www.miportal.me', 'content-type': 'application/json',
    authorization: 'Bearer admin-jwt', ...(reqHeaders || {})
  };
  return handler({
    method: 'POST', url: '/api/newsletter-send', headers,
    body: reqBody, ...rest
  }, res).then(() => res);
}

function subscribers(total) {
  return Array.from({ length: total }, (_, index) => ({
    email: `suscriptor${index}@correo.test`,
    email_hash: String(index).padStart(64, '0')
  }));
}

function claim(overrides = {}) {
  return {
    id: DISPATCH_ID, resource_id: RESOURCE_ID, status: 'processing',
    resource_snapshot: {
      id: RESOURCE_ID, title: 'Guía de React', published: true,
      description: 'Una guía práctica para empezar con React.',
      url: 'https://ejemplo.test/react',
      image_url: 'https://ejemplo.test/portada.png',
      created_at: '2026-09-21T12:00:00Z'
    },
    created_at: '2026-09-21T12:00:00Z',
    ...overrides
  };
}

// Estado de la "base de datos" simulada. El fetch enruta las RPC y Resend.
function makeFetch(state) {
  return t => t.mock.method(global, 'fetch', async (url, options = {}) => {
    const strUrl = String(url);
    const payload = options.body ? JSON.parse(options.body) : undefined;
    state.calls.push({ url: strUrl, options });

    if (strUrl.endsWith('/auth/v1/user')) {
      return state.authOk
        ? response(200, { id: UUID_ADMIN })
        : response(401, { message: 'invalid token' });
    }
    if (strUrl.includes('/rest/v1/rpc/user_is_admin')) {
      return response(200, state.adminRole);
    }
    if (strUrl.includes('/rest/v1/rpc/reserve_dispatch_call')) {
      return response(200, { allowed: state.reserveAllowed });
    }
    if (strUrl.includes('/rest/v1/rpc/claim_newsletter_dispatch')) {
      const wanted = payload?.p_resource_id || null;
      const index = state.claims.findIndex(d => !wanted || d.resource_id === wanted);
      if (index === -1) return response(200, null);
      const [next] = state.claims.splice(index, 1);
      return response(200, next);
    }
    if (strUrl.includes('/rest/v1/rpc/list_confirmed_subscribers')) {
      return response(200, state.subscribers);
    }
    if (strUrl.includes('/rest/v1/rpc/list_newsletter_sent')) {
      const rows = Array.from(state.sends.values())
        .filter(s => s.resourceId === payload.p_resource_id)
        .map(s => ({ email_hash: s.hash, status: s.status, attempts: s.attempts }));
      return response(200, rows);
    }
    if (strUrl.includes('/rest/v1/rpc/record_newsletter_sends')) {
      const { p_resource_id, p_results } = payload;
      for (const result of p_results) {
        const key = `${p_resource_id}|${result.email_hash}`;
        const previous = state.sends.get(key);
        state.sends.set(key, {
          resourceId: p_resource_id,
          hash: result.email_hash,
          status: result.status,
          attempts: result.status === 'failed'
            ? (previous ? previous.attempts + 1 : 1)
            : (previous ? previous.attempts : 0),
          resendId: result.resend_id || null
        });
      }
      state.recorded.push({ dispatch: payload.p_dispatch_id, results: p_results });
      return response(200, { recorded: p_results.length });
    }
    if (strUrl.includes('/rest/v1/rpc/complete_newsletter_dispatch')) {
      state.completed.push(payload);
      return response(200, true);
    }
    if (strUrl.includes('api.resend.com/emails/batch')) {
      const emails = payload;
      state.batchCallBodies.push(emails);
      state.batchHeaders.push(options.headers['Idempotency-Key']);
      const script = state.batchScript.shift();
      if (script) return response(script.status, script.body, script.headers);
      return response(200, emails.map(mail => ({
        id: 'res_' + mail.to[0].replace(/[^a-z0-9]/gi, '_'),
        to: mail.to[0]
      })));
    }
    throw new Error(`Fetch inesperado: ${strUrl}`);
  });
}

function freshState({ claims = [], subscribersList = [] } = {}) {
  return {
    authOk: true, adminRole: true, reserveAllowed: true,
    claims, subscribers: subscribersList,
    sends: new Map(), recorded: [], completed: [],
    batchHeaders: [], batchScript: [], batchCallBodies: [], calls: []
  };
}

test('newsletter-send rechaza sin configuración completa con 500 y sin red', async t => {
  withEnv(t);
  const logs = [];
  const spy = t.mock.method(console, 'error', line => logs.push(String(line)));
  const fetchSpy = t.mock.method(global, 'fetch', async () => {
    throw new Error('network must not run');
  });
  for (const key of Object.keys(config)) {
    if (!['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'NEWSLETTER_HASH_SECRET',
      'RESEND_API_KEY', 'RESEND_FROM_EMAIL'].includes(key)) continue;
    delete process.env[key];
    const result = await run();
    assert.equal(result.code, 500, key);
    assert.match(logs.at(-1), /Configuración incompleta/);
    process.env[key] = config[key];
  }
  assert.equal(fetchSpy.mock.callCount(), 0);
  spy.mock.restore();
});

test('newsletter-send exige sesión de administrador', async t => {
  withEnv(t);
  const state = freshState();
  makeFetch(state)(t);

  const noAuth = await run({ headers: { authorization: '' } });
  assert.equal(noAuth.code, 401);

  state.authOk = false;
  const invalid = await run();
  assert.equal(invalid.code, 401);

  state.authOk = true;
  state.adminRole = false;
  const viewer = await run();
  assert.equal(viewer.code, 403);
  assert.equal(state.calls.filter(c => c.url.includes('claim_newsletter_dispatch')).length, 0);
});

test('newsletter-send aplica throttle antes de reclamar la cola', async t => {
  withEnv(t);
  const state = freshState({ claims: [claim()] });
  makeFetch(state)(t);
  state.reserveAllowed = false;

  const limited = await run();
  assert.equal(limited.code, 429);
  assert.equal(limited.headers['Retry-After'], '3600');
  assert.equal(state.calls.filter(c => c.url.includes('claim_newsletter_dispatch')).length, 0);
});

test('modo prueba envía SOLO al correo de prueba y marca skipped', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'false', NEWSLETTER_TEST_EMAIL: 'prueba@gmail.com' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(3) });
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.enabled, false);
  assert.equal(result.body.handled, 1);

  assert.equal(state.batchHeaders.length, 1);
  assert.match(state.batchHeaders[0], new RegExp(`^newsletter/test/${DISPATCH_ID}$`));
  const [mail] = state.batchCallBodies[0];
  assert.deepEqual(mail.to, ['prueba@gmail.com']);
  assert.ok(mail.html.includes('Guía de React'));
  assert.ok(mail.html.includes('LEER PUBLICACIÓN'));
  assert.ok(mail.html.includes('https://ejemplo.test/react'));
  assert.ok(mail.headers['List-Unsubscribe']);
  assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(mail.headers['List-Unsubscribe'], /action=unsubscribe&token=/);
  assert.equal(mail.headers['List-Unsubscribe'].includes('prueba@gmail.com'), false);

  assert.deepEqual(state.completed.at(-1), {
    p_dispatch_id: DISPATCH_ID, p_status: 'skipped',
    p_sent: 0, p_failed: 0, p_total: 0, p_error: null
  });
  assert.equal(state.recorded.length, 0);
  assert.equal(state.calls.filter(c => c.url.includes('list_confirmed_subscribers')).length, 0);
});

test('modo prueba sin correo de prueba no envía nada', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'false', NEWSLETTER_TEST_EMAIL: '' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(3) });
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.handled, 1);
  assert.equal(state.batchHeaders.length, 0);
  assert.equal(state.completed.at(-1).p_status, 'skipped');
});

test('envío real marca sent sin destinatarios confirmados', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const state = freshState({ claims: [claim()], subscribersList: [] });
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.enabled, true);
  assert.equal(state.batchHeaders.length, 0);
  assert.deepEqual(state.completed.at(-1),
    { p_dispatch_id: DISPATCH_ID, p_status: 'sent', p_sent: 0, p_failed: 0, p_total: 0, p_error: null });
});

test('envío real divide en lotes de 100 con claves de idempotencia únicas', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(250) });
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.sent, 250);
  assert.equal(result.body.failed, 0);

  assert.equal(state.batchHeaders.length, 3);
  const keys = new Set(state.batchHeaders);
  assert.equal(keys.size, 3, 'cada lote usa una idempotency key distinta');
  assert.ok(['/0', '/1', '/2'].every((suffix, index) =>
    state.batchHeaders[index].endsWith(`${DISPATCH_ID}${suffix}`)));

  const recordCalls = state.calls.filter(c => c.url.includes('record_newsletter_sends')).map(c => c.options.body);
  assert.equal(recordCalls.length, 3);
  assert.ok([100, 100, 50].every((size, index) => JSON.parse(recordCalls[index]).p_results.length === size));
  assert.ok(recordCalls.every(raw => JSON.parse(raw).p_results.every(r => r.status === 'sent')));
  assert.ok(state.calls.some(c => c.url.includes('resend.com/emails/batch') &&
    JSON.parse(c.options.body).every(m => m.headers['List-Unsubscribe-Post'])));

  assert.deepEqual(state.completed.at(-1), {
    p_dispatch_id: DISPATCH_ID, p_status: 'sent',
    p_sent: 250, p_failed: 0, p_total: 250, p_error: null
  });
  assert.equal(JSON.stringify(state.recorded).includes('mock-provider-secret'), false);
});

test('reintento: no se reenvía a quien ya figura como enviado', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const confirmed = subscribers(250);
  const state = freshState({ claims: [claim()], subscribersList: confirmed });
  for (let index = 0; index < 240; index++) {
    state.sends.set(`${RESOURCE_ID}|${confirmed[index].email_hash}`, {
      resourceId: RESOURCE_ID, hash: confirmed[index].email_hash, status: 'sent', attempts: 0
    });
  }
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.sent, 10);
  assert.equal(result.body.failed, 0);

  assert.equal(state.batchHeaders.length, 1);
  const emails = state.batchCallBodies[0];
  assert.equal(emails.length, 10);
  const seen = new Set(emails.map(mail => mail.to[0]));
  for (let index = 0; index < 240; index++) {
    assert.equal(seen.has(confirmed[index].email), false, 'quien ya recibió no se reenvía');
  }
  assert.deepEqual(state.completed.at(-1).p_status, 'sent');
});

test('429 transitorio se reintenta con la MISMA idempotency key', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(101) });
  state.batchScript.push({ status: 429, body: { message: 'rate' } });
  makeFetch(state)(t);

  const result = await run({}, { resourceId: RESOURCE_ID });
  assert.equal(result.code, 202);
  assert.equal(result.body.sent, 101);
  assert.equal(state.batchHeaders.length, 3);
  assert.equal(state.batchHeaders[0], state.batchHeaders[1], 'reintento usa la clave del lote original');
  assert.equal(state.calls.filter(c => c.url.includes('resend.com/emails/batch')).length, 3);
  assert.deepEqual(state.completed.at(-1).p_status, 'sent');
});

test('fallo permanente marca failed y registra los reintentos por destinatario', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(50) });
  state.batchScript.push({ status: 422, body: { message: 'payload inválido mock-provider-secret' } });
  makeFetch(state)(t);

  const result = await run();
  assert.equal(result.code, 202);
  assert.equal(result.body.failed, 50);

  assert.equal(state.batchHeaders.length, 1, '422 no se reintenta');
  assert.equal(state.completed.at(-1).p_status, 'failed');
  assert.equal(state.completed.at(-1).p_failed, 50);
  assert.match(state.completed.at(-1).p_error, /50 destinatario/);
  assert.equal(state.completed.at(-1).p_error.includes('mock-provider-secret'), false);
  const recorded = state.recorded.flatMap(entry => entry.results);
  assert.equal(recorded.length, 50);
  assert.ok(recorded.every(r => r.status === 'failed'));
  assert.ok(recorded.every(r => r.error.includes('422')), 'el detalle por destinatario conserva el código');
  assert.equal(JSON.stringify(state.recorded).includes('mock-provider-secret'), false);
});

test('errores de infraestructura NO completan el envío (queda processing para reintentar)', async t => {
  withEnv(t, { NEWSLETTER_SEND_ENABLED: 'true' });
  const state = freshState({ claims: [claim()], subscribersList: subscribers(2) });
  const logs = [];
  const spy = t.mock.method(console, 'error', line => logs.push(String(line)));
  const fetchSpy = makeFetch(state)(t);

  state.sends = null; // fuerza fallo al leer registros de envío
  const result = await run();
  assert.equal(result.code, 503);
  assert.equal(state.completed.length, 0, 'no se marca ni sent ni failed');
  assert.equal(JSON.stringify(logs).includes('mock-db-secret'), false);
  assert.ok(fetchSpy.mock.callCount() > 0);
  spy.mock.restore();
});

test('GET responde ok y PUT se rechaza', async t => {
  withEnv(t);
  const state = freshState();
  makeFetch(state)(t);
  const get = await run({ method: 'GET' });
  assert.equal(get.code, 200);
  const put = await run({ method: 'PUT' });
  assert.equal(put.code, 405);
  assert.equal(put.headers.Allow, 'POST');
});

test('lib: pendingRecipients excluye enviados y agota intentos de los fallidos', () => {
  const confirmed = [
    { email: 'a@correo.test', email_hash: 'a'.repeat(64) },
    { email: 'b@correo.test', email_hash: 'b'.repeat(64) },
    { email: 'c@correo.test', email_hash: 'c'.repeat(64) }
  ];
  const sent = new Map([
    ['a'.repeat(64), { status: 'sent', attempts: 0 }],
    ['b'.repeat(64), { status: 'failed', attempts: 1 }],
    ['c'.repeat(64), { status: 'failed', attempts: 3 }]
  ]);
  const pending = dispatchLib.pendingRecipients(confirmed, sent, 3);
  assert.deepEqual(pending.map(p => p.email), ['b@correo.test']);
});

test('lib: validEmail acepta reales y rechaza inválidos', () => {
  for (const valid of ['hola@correo.test', 'a.b+c@sub.dominio.test']) {
    assert.equal(dispatchLib.validEmail(valid), true, valid);
  }
  for (const invalid of ['', '@x.test', 'a@b', 'a@.test', 'a b@test.test', '\r\nBcc:x@y.test']) {
    assert.equal(dispatchLib.validEmail(invalid), false, invalid);
  }
});