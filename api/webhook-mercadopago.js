// ============================================================================
// Webhook de Mercado Pago. Cuando un pago se aprueba, confirma el dato contra
// la API de Mercado Pago (status + monto + external_reference) antes de otorgar
// el rol 'pro'. La firma v2 solo se exige si MERCADOPAGO_WEBHOOK_SECRET existe.
// ============================================================================
const { createHmac, timingSafeEqual } = require('node:crypto');

const planPrice = 19999;
const planCurrency = 'COP';
const apiBase = 'https://api.mercadopago.com';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

function config() {
  const env = process.env;
  const missing = [];
  let database = null;
  try { database = new URL(env.SUPABASE_URL); } catch { database = null; }
  if (!database || database.protocol !== 'https:' || database.pathname !== '/') missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
  if (!env.MERCADOPAGO_ACCESS_TOKEN) missing.push('MERCADOPAGO_ACCESS_TOKEN');
  return { env, database, missing };
}

function signatureValid(headers, paymentId, secret) {
  const signature = headers['x-signature'];
  const requestId = headers['x-request-id'];
  if (typeof signature !== 'string' || typeof requestId !== 'string') return false;
  const parts = Object.fromEntries(signature.split(';').map(pair => pair.split('=')));
  const ts = parts.ts;
  const received = parts.v1;
  if (typeof ts !== 'string' || typeof received !== 'string') return false;
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function paymentIdFrom(body, url) {
  const source = body?.data?.id ?? body?.id ?? url?.searchParams?.get('data.id') ?? url?.searchParams?.get('id');
  return typeof source === 'string' && source !== '' ? source : null;
}

function logSafe(message) {
  let line = message;
  for (const value of [process.env.MERCADOPAGO_ACCESS_TOKEN, process.env.SUPABASE_SECRET_KEY,
    process.env.MERCADOPAGO_WEBHOOK_SECRET]) {
    if (typeof value === 'string' && value.length >= 8) line = line.split(value).join('***');
  }
  console.error(line);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });

  if (req.method === 'GET') {
    return res.status(200).send('ok');
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Método no permitido.');
  }

  const url = new URL(req.url, 'https://www.miportal.me');
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  let body;
  try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { body = {}; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || raw === '')
    return jsonResponse(res, 200, { ok: true });

  const paymentId = paymentIdFrom(body, url);
  const isPaymentNotification =
    (body.type == null || body.type === 'payment') &&
    (body.action == null || body.action === 'payment.created' || body.action === 'payment.updated');
  if (!isPaymentNotification) return jsonResponse(res, 200, { ok: true });
  if (!paymentId) return jsonResponse(res, 200, { ok: true });

  const configured = config();
  if (configured.missing.length) {
    logSafe(`[webhook-mercadopago] Configuración incompleta: ${configured.missing.join(', ')}`);
    return fail(500, 'Configuración incompleta.');
  }

  if (configured.env.MERCADOPAGO_WEBHOOK_SECRET &&
      !signatureValid(req.headers, paymentId, configured.env.MERCADOPAGO_WEBHOOK_SECRET)) {
    return fail(401, 'Firma no válida.');
  }

  let payment;
  try {
    const response = await fetch(`${apiBase}/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${configured.env.MERCADOPAGO_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { }
      logSafe(`[webhook-mercadopago] Mercado Pago respondió ${response.status} para el pago ${paymentId} — ${detail}`);
      return fail(502, 'Mercado Pago no confirmó el pago.');
    }
    payment = await response.json();
  } catch (error) {
    logSafe(`[webhook-mercadopago] Error consultando pago ${paymentId}: ${error?.message ?? error}`);
    return fail(504, 'Mercado Pago no respondió a tiempo.');
  }

  const externalReference = payment?.external_reference;
  const approved = payment?.status === 'approved';
  const amountOk = Number(payment?.transaction_amount) === planPrice;
  const currencyOk = payment?.currency_id === planCurrency;
  const referenceOk = typeof externalReference === 'string' && uuidPattern.test(externalReference);

  if (!approved || !amountOk || !currencyOk || !referenceOk) {
    logSafe(`[webhook-mercadopago] Pago ${paymentId} no habilita el plan: status=${payment?.status}, monto=${payment?.transaction_amount}, moneda=${payment?.currency_id}, ref=${externalReference}`);
    return jsonResponse(res, 200, { ok: true });
  }

  const payload = {
    p_user_id: externalReference,
    p_payment_id: String(payment.id),
    p_amount: Number(payment.transaction_amount),
    p_currency: payment.currency_id
  };

  try {
    const response = await fetch(
      `${configured.database.origin}/rest/v1/rpc/record_pro_payment`, {
        method: 'POST', redirect: 'error',
        headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${configured.env.SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(3000)
      });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { }
      logSafe(`[webhook-mercadopago] Supabase record_pro_payment respondió ${response.status} — ${detail}`);
      return fail(502, 'La base de datos no confirmó el pago.');
    }
    logSafe(`[webhook-mercadopago] Pago aprobado ${paymentId} → pro para ${externalReference}`);
    return jsonResponse(res, 200, { ok: true });
  } catch (error) {
    logSafe(`[webhook-mercadopago] Error al registrar pago ${paymentId}: ${error?.message ?? error}`);
    return fail(504, 'La base de datos no respondió a tiempo.');
  }
};