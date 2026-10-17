// ============================================================================
// Crea una preferencia de Checkout Pro de Mercado Pago por cada usuario.
// external_reference = user_id permite asociar el pago al perfil cuando el
// webhook notifica el resultado. Devuelve init_point para redirigir al pago.
// ============================================================================
const { verifyUser } = require('../lib/server-auth');
const { createHash } = require('node:crypto');
const origins = new Set([
  'https://www.miportal.me', 'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const planTitle = 'MiPortal Pro — suscripción anual';
const planPrice = 19999;
const planCurrency = 'COP';
const apiBase = 'https://api.mercadopago.com';
const siteBase = 'https://www.miportal.me';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

function originAllowed(origin) {
  if (typeof origin !== 'string') return false;
  if (origins.has(origin)) return true;
  return process.env.VERCEL !== '1' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

function config() {
  const env = process.env;
  const missing = [];
  if (!env.MERCADOPAGO_ACCESS_TOKEN) missing.push('MERCADOPAGO_ACCESS_TOKEN');
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) missing.push('MERCADOPAGO_WEBHOOK_SECRET');
  if (!['test', 'production'].includes(env.MERCADOPAGO_MODE)) missing.push('MERCADOPAGO_MODE');
  if (env.VERCEL !== '1') missing.push('VERCEL');
  return { env, missing };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Método no permitido.');
  }
  if (!originAllowed(req.headers.origin)) return fail(403, 'Origen no permitido.');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return fail(415, 'Formato no permitido.');
  }

  const configured = config();
  if (configured.missing.length) {
    console.error(`[mp-preference] Configuración incompleta: ${configured.missing.join(', ')}`);
    return fail(503, 'El pago Pro no está configurado. Avisa al administrador del sitio.');
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  let body;
  try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return fail(400, 'Datos inválidos.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'user_id')) return fail(400, 'Datos inválidos.');
  const identity = await verifyUser(req);
  if (identity.status) return fail(identity.status,
    identity.status === 401 ? 'Inicia sesión para continuar.' : 'No pudimos verificar tu sesión.');
  const user_id = identity.user.id;
  if (body.user_id !== undefined && body.user_id !== user_id) return fail(403, 'Usuario no autorizado.');
  const requestKey = req.headers['idempotency-key'];
  if (typeof requestKey !== 'string' || !uuidPattern.test(requestKey)) return fail(400, 'Solicitud de pago no válida.');
  const idempotencyKey = createHash('sha256').update(`pro:${user_id}:${requestKey}`).digest('hex');

  try {
    const readiness = await fetch(`${identity.configured.database.origin}/rest/v1/rpc/has_active_pro`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: identity.configured.key, Authorization: identity.header, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(3000)
    });
    if (!readiness.ok || typeof await readiness.json() !== 'boolean') {
      return fail(503, 'Las suscripciones no están disponibles temporalmente.');
    }
  } catch { return fail(503, 'Las suscripciones no están disponibles temporalmente.'); }

  try {
    const response = await fetch(`${apiBase}/checkout/preferences`, {
      method: 'POST', redirect: 'error',
      headers: {
        Authorization: `Bearer ${configured.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify({
        items: [{
          title: planTitle,
          quantity: 1,
          unit_price: planPrice,
          currency_id: planCurrency
        }],
        external_reference: user_id,
        notification_url: `${siteBase}/api/webhook-mercadopago`,
        back_urls: {
          success: `${siteBase}/gracias-pro.html`,
          pending: `${siteBase}/gracias-pro.html`,
          failure: `${siteBase}/index.html`
        },
        auto_return: 'approved'
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { }
      console.error(`[mp-preference] Mercado Pago respondió ${response.status} — ${detail}`);
      return fail(response.status === 422 ? 422 : 502,
        response.status === 422 ? 'El enlace de pago no pudo generarse.' : 'El proveedor de pagos está momentáneamente no disponible.');
    }
    const result = await response.json();
    if (!result?.init_point) return fail(502, 'El proveedor de pagos no devolvió un enlace.');
    return jsonResponse(res, 200, { init_point: result.init_point });
  } catch (error) {
    console.error(`[mp-preference] Error: ${error?.message ?? error}`);
    return fail(504, 'El proveedor de pagos no respondió a tiempo. Probá nuevamente.');
  }
};
