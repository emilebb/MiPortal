const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');

const origins = new Set([
  'https://www.miportal.me', 'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const maxBytes = 24000;
const retryWindow = 23 * 60 * 60 * 1000;
const unavailable = 'Contacto no está disponible. Inténtalo más tarde.';
const uncertain = 'No pudimos confirmar el envío. Reintenta sin cambiar el mensaje.';

function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length > 64) return false;
  return /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
    .test(parts[0]) && parts[1].includes('.') && parts[1].split('.').every(
      label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
    );
}

function retryAfter(value, fallback = 60) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0
    ? Math.min(seconds, 86400) : fallback;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (code, error) => res.status(code).json({ error });
  const limited = seconds => {
    res.setHeader('Retry-After', String(seconds));
    return fail(429, `Límite de envíos alcanzado. Espera ${seconds} segundos.`);
  };
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Método no permitido.');
  }
  if (!origins.has(req.headers.origin)) return fail(403, 'Origen no permitido.');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    req.headers['content-type'] || ''
  ) || (req.headers['content-encoding'] &&
    req.headers['content-encoding'] !== 'identity')) {
    return fail(415, 'Formato no permitido.');
  }
  if (Number(req.headers['content-length']) > maxBytes) {
    return fail(413, 'El mensaje supera el tamaño permitido.');
  }
  let body;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (Buffer.byteLength(serialized || '') > maxBytes) {
      return fail(413, 'El mensaje supera el tamaño permitido.');
    }
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return fail(400, 'Datos inválidos.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'Datos inválidos.');
  }
  const fields = ['name', 'email', 'message', 'website', 'requestId', 'createdAt'];
  if (Object.keys(body).some(key => !fields.includes(key))) {
    return fail(400, 'Datos inválidos.');
  }
  const { name, email, message, website, requestId, createdAt } = body;
  if (website !== undefined && website !== '') {
    return fail(400, 'Solicitud no válida.');
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100 ||
      /[\x00-\x1f\x7f]/.test(name) || !validEmail(email) ||
      typeof message !== 'string' || message.trim().length < 10 ||
      message.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
      typeof requestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
        .test(requestId) || !Number.isSafeInteger(createdAt) ||
      createdAt > Date.now() + 60000) {
    return fail(400, 'Revisa el nombre, correo y mensaje (10–5000 caracteres).');
  }
  // La ventana termina antes de que Resend olvide la clave (24 horas).
  if (Date.now() - createdAt > retryWindow) {
    return fail(409, 'La solicitud caducó. Comprueba el envío antes de crear otra.');
  }
  const env = process.env;
  const salt = env.CONTACT_HASH_SECRET;
  let database;
  try { database = new URL(env.SUPABASE_URL); } catch { /* Configuración inválida. */ }
  if (!env.SUPABASE_SECRET_KEY || !database || database.protocol !== 'https:' ||
      database.username || database.password || database.search || database.hash ||
      database.pathname !== '/' || !salt || salt.length < 32 ||
      !env.RESEND_API_KEY || !validEmail(env.RESEND_FROM_EMAIL) ||
      !validEmail(env.CONTACT_TO_EMAIL) || env.VERCEL !== '1') {
    return fail(503, unavailable);
  }
  // Solo la cabecera sobrescrita por Vercel; nunca X-Forwarded-For del cliente.
  const rawIP = req.headers['x-vercel-forwarded-for'];
  if (typeof rawIP !== 'string' || !isIP(rawIP)) {
    return fail(503, 'No se pudo validar la solicitud.');
  }
  const ip = isIP(rawIP) === 6 ? new URL(`http://[${rawIP}]`).hostname : rawIP;
  const hash = value => createHmac('sha256', salt).update(value).digest('hex');
  try {
    const response = await fetch(
      `${database.origin}/rest/v1/rpc/reserve_contact_attempt`, {
        method: 'POST', redirect: 'error',
        headers: { apikey: env.SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json' },
        body: JSON.stringify({ p_sender_hash: hash(`ip:${ip}`),
          p_email_hash: hash(`email:${email.toLowerCase()}`) }),
        signal: AbortSignal.timeout(3000)
      }
    );
    if (!response.ok) return fail(503, unavailable);
    const limit = await response.json();
    if (limit?.allowed === false) return limited(retryAfter(limit.retry_after, 3600));
    if (limit?.allowed !== true) return fail(503, unavailable);
  } catch { return fail(503, unavailable); }

  const payload = {
    from: env.RESEND_FROM_EMAIL, to: [env.CONTACT_TO_EMAIL],
    subject: 'Nuevo mensaje de MiPortal', reply_to: email,
    text: `Nombre: ${name.trim()}\nCorreo: ${email}\n\n${message.trim()}`
  };
  // Vincula la clave al contenido, la configuración y el inicio del intento.
  const key = hash(JSON.stringify([requestId.toLowerCase(), createdAt, payload]));
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json', 'Idempotency-Key': `contact/${key}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429) {
      return limited(retryAfter(response.headers.get('Retry-After')));
    }
    if (response.status === 409) {
      res.setHeader('Retry-After', '5');
      return fail(409, 'El envío está en conflicto o en curso. Reintenta más tarde.');
    }
    if (!response.ok) return fail(502, uncertain);
    const result = await response.json();
    if (typeof result?.id !== 'string' || !result.id) return fail(502, uncertain);
    return res.status(202).json({
      message: 'Mensaje aceptado por el servicio de correo. La entrega puede tardar.'
    });
  } catch (error) {
    return fail(error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 504 : 502, uncertain);
  }
};
