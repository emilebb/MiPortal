// ============================================================================
// Webhook de Mercado Pago. Cuando un pago se aprueba, confirma el dato contra
// la API de Mercado Pago (status + monto + external_reference) antes de otorgar
// la vigencia Pro, independiente del rol administrativo. Firma obligatoria.
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
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) missing.push('MERCADOPAGO_WEBHOOK_SECRET');
  if (!['test', 'production'].includes(env.MERCADOPAGO_MODE)) missing.push('MERCADOPAGO_MODE');
  return { env, database, missing };
}

function signatureValid(headers, paymentId, secret) {
  const signature = headers['x-signature'];
  const requestId = headers['x-request-id'];
  if (typeof signature !== 'string' || typeof requestId !== 'string') return false;
  const entries = signature.split(',').map(pair => pair.trim().split('='));
  if (entries.some(pair => pair.length !== 2) || new Set(entries.map(pair => pair[0])).size !== entries.length) return false;
  const parts = Object.fromEntries(entries);
  const ts = parts.ts;
  const received = parts.v1;
  if (!/^\d{10,13}$/.test(ts || '') || !/^[a-f0-9]{64}$/i.test(received || '')) return false;
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

function paymentIdFrom(body, url) {
  const source = url?.searchParams?.get('data.id');
  if (typeof source !== 'string' || !/^\d{1,30}$/.test(source)) return null;
  if (body?.data?.id !== undefined && String(body.data.id) !== source) return null;
  return source;
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
  if (!paymentId) return fail(400, 'Identificador de pago no válido.');

  const configured = config();
  if (configured.missing.length) {
    logSafe(`[webhook-mercadopago] Configuración incompleta: ${configured.missing.join(', ')}`);
    return fail(500, 'Configuración incompleta.');
  }

  if (!signatureValid(req.headers, paymentId, configured.env.MERCADOPAGO_WEBHOOK_SECRET)) {
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
  if (String(payment?.id) !== paymentId || payment?.live_mode !== (configured.env.MERCADOPAGO_MODE === 'production')) {
    return fail(422, 'El pago no corresponde al entorno esperado.');
  }
  const approved = payment?.status === 'approved';
  if (payment?.status === 'cancelled' && !payment?.date_approved) return jsonResponse(res, 200, { ok: true });
  const revoked = ['refunded', 'charged_back', 'cancelled'].includes(payment?.status) || Number(payment?.transaction_amount_refunded) > 0;
  const amountOk = Number(payment?.transaction_amount) === planPrice;
  const currencyOk = payment?.currency_id === planCurrency;
  const referenceOk = typeof externalReference === 'string' && uuidPattern.test(externalReference);

  if ((!approved && !revoked) || !amountOk || !currencyOk || !referenceOk) {
    logSafe(`[webhook-mercadopago] Pago ${paymentId} no habilita el plan: status=${payment?.status}, monto=${payment?.transaction_amount}, moneda=${payment?.currency_id}, ref=${externalReference}`);
    return jsonResponse(res, 200, { ok: true });
  }

  const payload = {
    p_user_id: externalReference,
    p_payment_id: String(payment.id),
    p_amount: Number(payment.transaction_amount),
    p_currency: payment.currency_id,
    p_status: revoked ? 'revoked' : 'approved',
    p_approved_at: payment.date_approved,
    p_updated_at: payment.date_last_updated
  };
  if (!Number.isFinite(Date.parse(payload.p_updated_at)) ||
      !Number.isFinite(Date.parse(payload.p_approved_at))) return fail(422, 'Fechas del pago no válidas.');

  try {
    const response = await fetch(
      `${configured.database.origin}/rest/v1/rpc/record_pro_payment_event`, {
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
    logSafe(`[webhook-mercadopago] Evento ${payload.p_status} registrado para pago ${paymentId}`);
    return jsonResponse(res, 200, { ok: true });
  } catch (error) {
    logSafe(`[webhook-mercadopago] Error al registrar pago ${paymentId}: ${error?.message ?? error}`);
    return fail(504, 'La base de datos no respondió a tiempo.');
  }
};
