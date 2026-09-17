const { createHmac, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');

const origins = new Set([
  'https://www.miportal.me', 'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const maxBytes = 4000;
const tokenLifetime = 48 * 60 * 60 * 1000;
const unavailable = 'La suscripción no está disponible. Inténtalo más tarde.';

function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[0].length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(parts[0]) &&
    parts[1].includes('.') && parts[1].split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

function tokenFor(hash, expiresAt, secret) {
  const payload = `${hash}.${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function readToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return null; }
  const [hash, expiresAt] = payload.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!/^[a-f0-9]{64}$/.test(hash) || !/^\d+$/.test(expiresAt) ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ||
      Number(expiresAt) < Date.now()) return null;
  return hash;
}

function config() {
  const env = process.env;
  let database;
  try { database = new URL(env.SUPABASE_URL); } catch { return null; }
  if (database.protocol !== 'https:' || database.username || database.password ||
      database.pathname !== '/' || !env.SUPABASE_SECRET_KEY ||
      !env.NEWSLETTER_HASH_SECRET || env.NEWSLETTER_HASH_SECRET.length < 32 ||
      !env.RESEND_API_KEY || !validEmail(env.RESEND_FROM_EMAIL) || env.VERCEL !== '1') {
    return null;
  }
  return { env, database };
}

async function rpc(configured, name, payload) {
  const response = await fetch(
    `${configured.database.origin}/rest/v1/rpc/${name}`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${configured.env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(3000)
    });
  if (!response.ok) throw new Error('Database request failed');
  return response.json();
}

async function sendEmail(configured, to, subject, text, key) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${configured.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json', 'Idempotency-Key': `newsletter/${key}` },
    body: JSON.stringify({ from: configured.env.RESEND_FROM_EMAIL, to: [to], subject, text }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Provider request failed');
  const result = await response.json();
  if (!result?.id) throw new Error('Provider response invalid');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const configured = config();
    const url = new URL(req.url, 'https://www.miportal.me');
    const hash = configured && readToken(url.searchParams.get('token'), configured.env.NEWSLETTER_HASH_SECRET);
    if (!hash || !configured) return jsonResponse(res, 400, { error: 'El enlace no es válido o caducó.' });
    const action = url.searchParams.get('action');
    if (action !== 'confirm' && action !== 'unsubscribe') return jsonResponse(res, 400, { error: 'Acción no válida.' });
    try {
      await rpc(configured, 'update_newsletter_status', { p_email_hash: hash, p_status: action === 'confirm' ? 'confirmed' : 'unsubscribed' });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<p>${action === 'confirm' ? 'Suscripción confirmada.' : 'Suscripción cancelada.'} Ya podés cerrar esta ventana.</p>`);
    } catch { return jsonResponse(res, 503, { error: unavailable }); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return jsonResponse(res, 405, { error: 'Método no permitido.' });
  }
  if (!origins.has(req.headers.origin)) return jsonResponse(res, 403, { error: 'Origen no permitido.' });
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return jsonResponse(res, 415, { error: 'Formato no permitido.' });
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw) || '') > maxBytes) {
    return jsonResponse(res, 413, { error: 'Solicitud demasiado grande.' });
  }
  let body;
  try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return jsonResponse(res, 400, { error: 'Datos inválidos.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['email', 'website'].includes(key)) ||
      body.website !== undefined && body.website !== '' || !validEmail(body.email)) {
    return jsonResponse(res, 400, { error: 'Ingresá un correo válido.' });
  }
  const configured = config();
  const rawIP = req.headers['x-vercel-forwarded-for'];
  if (!configured || typeof rawIP !== 'string' || !isIP(rawIP)) return jsonResponse(res, 503, { error: unavailable });
  const email = body.email.trim().toLowerCase();
  const hash = createHmac('sha256', configured.env.NEWSLETTER_HASH_SECRET).update(email).digest('hex');
  const expiresAt = Date.now() + tokenLifetime;
  const confirmUrl = `https://www.miportal.me/api/newsletter?action=confirm&token=${encodeURIComponent(tokenFor(hash, expiresAt, configured.env.NEWSLETTER_HASH_SECRET))}`;
  const unsubscribeUrl = `https://www.miportal.me/api/newsletter?action=unsubscribe&token=${encodeURIComponent(tokenFor(hash, expiresAt, configured.env.NEWSLETTER_HASH_SECRET))}`;
  try {
    const limit = await rpc(configured, 'reserve_newsletter_attempt', { p_sender_hash: createHmac('sha256', configured.env.NEWSLETTER_HASH_SECRET).update(`ip:${rawIP}`).digest('hex') });
    if (limit?.allowed !== true) return jsonResponse(res, 429, { error: 'Demasiados intentos. Probá más tarde.' });
    const result = await rpc(configured, 'upsert_newsletter_subscriber', { p_email: email, p_email_hash: hash });
    await sendEmail(configured, email, 'Confirmá tu suscripción a MiPortal',
      `Confirmá tu suscripción abriendo este enlace:\n${confirmUrl}\n\nPara cancelar la suscripción:\n${unsubscribeUrl}`, hash);
    return jsonResponse(res, 202, { message: result?.status === 'confirmed' ? 'Te enviamos las preferencias de suscripción.' : 'Revisá tu correo para confirmar la suscripción.' });
  } catch { return jsonResponse(res, 503, { error: unavailable }); }
};