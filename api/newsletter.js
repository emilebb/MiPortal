const { createHmac, timingSafeEqual } = require('node:crypto');
const { isIP } = require('node:net');
const { buildWelcomeEmail } = require('../lib/emails');

const origins = new Set([
  'https://www.miportal.me', 'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const maxBytes = 4000;
const tokenLifetime = 48 * 60 * 60 * 1000;
const unavailable = 'El servicio de suscripción está momentáneamente no disponible. Inténtalo más tarde.';
const misconfigured = 'La suscripción a novedades no está configurada. Avisa al administrador del sitio.';

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
  const missing = [];
  let database = null;
  try { database = new URL(env.SUPABASE_URL); } catch { database = null; }
  if (!database || database.protocol !== 'https:' || database.username ||
      database.password || database.pathname !== '/') missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
  if (typeof env.NEWSLETTER_HASH_SECRET !== 'string' || env.NEWSLETTER_HASH_SECRET.length < 32) missing.push('NEWSLETTER_HASH_SECRET');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!validEmail(env.RESEND_FROM_EMAIL)) missing.push('RESEND_FROM_EMAIL');
  if (env.VERCEL !== '1') missing.push('VERCEL');
  return { env, database, missing };
}

function clientIP(req) {
  const first = name => {
    const value = req.headers[name];
    return typeof value === 'string' ? value.split(',')[0].trim() : '';
  };
  if (process.env.VERCEL === '1') {
    const trusted = req.headers['x-vercel-forwarded-for'];
    return typeof trusted === 'string' && isIP(trusted) ? trusted : null;
  }
  for (const candidate of [first('x-vercel-forwarded-for'),
    first('x-forwarded-for'), first('x-real-ip'),
    req.socket?.remoteAddress, req.connection?.remoteAddress]) {
    if (typeof candidate === 'string' && isIP(candidate)) return candidate;
  }
  return null;
}

function originAllowed(origin) {
  if (typeof origin !== 'string') return false;
  if (origins.has(origin)) return true;
  return process.env.VERCEL !== '1' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

function safeJson(value) {
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'string' ? value.slice(0, 120) : String(value ?? '');
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/key|secret|token|authorization|apikey|password|bearer/i.test(key)) continue;
    out[key] = typeof entry === 'string' ? entry.slice(0, 120)
      : typeof entry === 'object' && entry !== null ? safeJson(entry) : entry;
  }
  return JSON.stringify(out).slice(0, 300);
}

function upstreamError(context, status, detail, unavailable) {
  const error = new Error(`${context} respondió ${status}`);
  error.context = context;
  error.status = status;
  error.detail = detail;
  error.unavailable = unavailable ?? (Number.isInteger(status) && status >= 500);
  return error;
}

function logUpstream(error) {
  const name = error?.name ?? 'Error';
  const context = error?.context ? `${error.context}: ` : '';
  const status = Number.isInteger(error?.status) ? ` [HTTP ${error.status}]` : '';
  const detail = error?.detail ? ` — ${safeJson(error.detail)}` : '';
  let line = `[newsletter] ${context}${name}${status}${detail}`;
  for (const value of [process.env.RESEND_API_KEY, process.env.SUPABASE_SECRET_KEY,
    process.env.NEWSLETTER_HASH_SECRET]) {
    if (typeof value === 'string' && value.length >= 8) line = line.split(value).join('***');
  }
  console.error(line);
}

function upstreamStatus(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 504;
  if (Number.isInteger(error?.status) && error.status === 429) return 429;
  if (error?.unavailable === true) return 503;
  return 502;
}

function upstreamMessage(error) {
  return error?.status === 429 ? 'Demasiados intentos. Probá más tarde.' : unavailable;
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
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { }
    throw upstreamError(`Supabase ${name}`, response.status, detail);
  }
  return response.json();
}

async function sendWelcome(configured, to, urls, key) {
  const { html, text } = buildWelcomeEmail(urls);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${configured.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json', 'Idempotency-Key': `newsletter/${key}` },
    body: JSON.stringify({ from: `MiPortal <${configured.env.RESEND_FROM_EMAIL}>`,
      to: [to], subject: '¡Bienvenido a MiPortal! 🎉', html, text }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { }
    throw upstreamError('Resend', response.status, detail);
  }
  const result = await response.json();
  if (!result?.id) throw upstreamError('Resend', 502, result, false);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({ error });

  if (req.method === 'GET') {
    const { env, database, missing } = config();
    if (missing.length) {
      console.error(`[newsletter] GET: configuración incompleta: ${missing.join(', ')}`);
      return fail(500, misconfigured);
    }
    const url = new URL(req.url, 'https://www.miportal.me');
    const action = url.searchParams.get('action');
    if (action !== 'confirm' && action !== 'unsubscribe') return fail(400, 'Acción no válida.');
    const hash = readToken(url.searchParams.get('token'), env.NEWSLETTER_HASH_SECRET);
    if (!hash) return fail(400, 'El enlace no es válido o caducó.');
    try {
      await rpc({ env, database }, 'update_newsletter_status',
        { p_email_hash: hash, p_status: action === 'confirm' ? 'confirmed' : 'unsubscribed' });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<p>${action === 'confirm' ? 'Suscripción confirmada.' : 'Suscripción cancelada.'} Ya podés cerrar esta ventana.</p>`);
    } catch (error) { logUpstream(error); return fail(upstreamStatus(error), unavailable); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(405, 'Método no permitido.');
  }
  if (!originAllowed(req.headers.origin)) return fail(403, 'Origen no permitido.');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return fail(415, 'Formato no permitido.');
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw) || '') > maxBytes) {
    return fail(413, 'Solicitud demasiado grande.');
  }
  let body;
  try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return fail(400, 'Datos inválidos.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['email', 'website'].includes(key)) ||
      body.website !== undefined && body.website !== '' || !validEmail(body.email)) {
    return fail(400, 'Ingresá un correo válido.');
  }

  const configured = config();
  if (configured.missing.length) {
    console.error(`[newsletter] Configuración incompleta: ${configured.missing.join(', ')}`);
    return fail(500, misconfigured);
  }
  const ip = clientIP(req);
  if (!ip) return fail(400, 'No se pudo validar la solicitud.');

  const email = body.email.trim().toLowerCase();
  const hash = createHmac('sha256', configured.env.NEWSLETTER_HASH_SECRET).update(email).digest('hex');
  const expiresAt = Date.now() + tokenLifetime;
  const confirmUrl = `https://www.miportal.me/api/newsletter?action=confirm&token=${encodeURIComponent(tokenFor(hash, expiresAt, configured.env.NEWSLETTER_HASH_SECRET))}`;
  const unsubscribeUrl = `https://www.miportal.me/api/newsletter?action=unsubscribe&token=${encodeURIComponent(tokenFor(hash, expiresAt, configured.env.NEWSLETTER_HASH_SECRET))}`;
  try {
    const limit = await rpc(configured, 'reserve_newsletter_attempt',
      { p_sender_hash: createHmac('sha256', configured.env.NEWSLETTER_HASH_SECRET).update(`ip:${ip}`).digest('hex') });
    if (limit?.allowed !== true) {
      res.setHeader('Retry-After', '3600');
      return fail(429, 'Demasiados intentos. Probá más tarde.');
    }
    const result = await rpc(configured, 'upsert_newsletter_subscriber', { p_email: email, p_email_hash: hash });
    try {
      await sendWelcome(configured, email, { confirmUrl, unsubscribeUrl }, hash);
    } catch (error) {
      logUpstream(error);
    }
    return jsonResponse(res, 202, { message: result?.status === 'confirmed'
      ? '¡Gracias! Te has suscrito correctamente.'
      : '¡Gracias! Te has suscrito correctamente. Revisá tu correo para confirmar tu suscripción.' });
  } catch (error) {
    logUpstream(error);
    return fail(upstreamStatus(error), upstreamMessage(error));
  }
};