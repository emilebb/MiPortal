'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { createServiceClient, configError, json, readConfig, uuidPattern } = require('../../lib/digital-products-api');

function paymentIdFrom(body, url) {
  const value = body?.data?.id ?? body?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id');
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^[0-9]{1,32}$/.test(value) ? value : null;
}

function signatureValid(headers, paymentId, secret, now = Date.now()) {
  const signature = headers['x-signature'];
  const requestId = headers['x-request-id'];
  if (typeof signature !== 'string' || typeof requestId !== 'string' || requestId.length > 200) return false;
  const parts = Object.fromEntries(signature.split(/[;,]/).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key, value]) => key && value));
  const ts = parts.ts;
  const received = parts.v1;
  if (!/^[0-9]{10,13}$/.test(ts || '') || !/^[a-f0-9]{64}$/i.test(received || '')) return false;
  const tsMs = Number(ts) * (String(ts).length === 10 ? 1000 : 1);
  if (!Number.isSafeInteger(tsMs) || Math.abs(now - tsMs) > 30 * 60 * 1000) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  const actual = Buffer.from(received, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function mapProviderStatus(status, statusDetail) {
  // Mercado Pago reports chargebacks as `in_mediation` while they are under
  // review. Revoke access during the dispute. A `settled` chargeback means the
  // funds were retained by the seller, so restore the approved entitlement.
  if (status === 'charged_back') return statusDetail === 'settled' ? 'chargeback_won' : 'charged_back';
  if (status === 'in_mediation') return 'charged_back';
  if (['approved', 'pending', 'rejected', 'cancelled', 'refunded'].includes(status)) return status;
  if (['in_process', 'authorized', 'action_required'].includes(status)) return 'pending';
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).send('ok');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return json(res, 405, { error: 'Método no permitido.' });
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return json(res, 415, { error: 'Formato no permitido.' });
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  let bodyBytes = 0;
  try { bodyBytes = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)); } catch { }
  if (bodyBytes > 32768) return json(res, 413, { error: 'Solicitud demasiado grande.' });
  let body;
  try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return json(res, 400, { error: 'Datos inválidos.' }); }
  const url = new URL(req.url, 'https://www.miportal.me');
  const isPaymentNotification = (body?.type == null || body.type === 'payment') &&
    (body?.action == null || body.action === 'payment.created' || body.action === 'payment.updated');
  if (!isPaymentNotification) return json(res, 200, { ok: true });
  const paymentId = paymentIdFrom(body, url);
  if (!paymentId) return json(res, 200, { ok: true });

  const config = readConfig({ needsMercadoPago: true, needsWebhook: true });
  if (configError(config, res)) return;
  if (!signatureValid(req.headers, paymentId, config.env.MERCADOPAGO_WEBHOOK_SECRET)) {
    return json(res, 401, { error: 'Firma no válida.' });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${config.env.MERCADOPAGO_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) {
      console.error(`[digital-products] Mercado Pago payment lookup returned HTTP ${response.status}`);
      return json(res, 502, { error: 'No se pudo verificar el pago.' });
    }
    const payment = await response.json();
    const orderId = payment?.external_reference;
    const status = mapProviderStatus(payment?.status, payment?.status_detail);
    if (String(payment?.id) !== paymentId || typeof orderId !== 'string' || !uuidPattern.test(orderId) ||
        !status || !Number.isFinite(Number(payment?.transaction_amount)) || payment?.currency_id !== 'COP') {
      console.warn('[digital-products] ignored payment notification with invalid order, status, amount, or currency');
      return json(res, 200, { ok: true });
    }
    const supabase = createServiceClient(config);
    const { data, error } = await supabase.rpc('record_digital_product_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_status: status,
      p_amount: Number(payment.transaction_amount),
      p_currency: payment.currency_id
    });
    if (error) {
      console.error('[digital-products] payment recording RPC failed');
      return json(res, 502, { error: 'No se pudo registrar el pago.' });
    }
    if (!data?.accepted) console.warn('[digital-products] payment did not match its order; no download access granted');
    return json(res, 200, { ok: true });
  } catch (error) {
    const safeName = /^[A-Za-z]+$/.test(error?.name || '') ? error.name : 'Error';
    console.error(`[digital-products] payment verification failed (${safeName})`);
    return json(res, 504, { error: 'No fue posible verificar el pago ahora.' });
  }
};

module.exports.signatureValid = signatureValid;
module.exports.mapProviderStatus = mapProviderStatus;
