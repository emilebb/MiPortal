const { createHash } = require('node:crypto');
const { isIP } = require('node:net');

const origins = new Set([
  'https://www.miportal.me', 'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const maxBytes = 24000;
const retryWindow = 23 * 60 * 60 * 1000;
const rateWindow = 60 * 60 * 1000;
const ipLimit = 6;
const emailLimit = 6;
const globalLimit = 50;
const misconfigured = 'El formulario de contacto no está configurado. Avisa al administrador del sitio.';
const uncertain = 'No pudimos confirmar el envío. Reintenta sin cambiar el mensaje.';

// Limitador básico en memoria por instancia. No sustituye a un WAF, pero frena
// ráfagas repetidas junto al honeypot y la validación de entrada.
const attempts = new Map();

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

function pruneAttempts(now) {
  for (const [key, times] of attempts) {
    const recent = times.filter(time => time > now - rateWindow);
    if (recent.length) attempts.set(key, recent); else attempts.delete(key);
  }
}

function allowed(key, limit, now) {
  const recent = (attempts.get(key) || []).filter(time => time > now - rateWindow);
  if (recent.length >= limit) { attempts.set(key, recent); return false; }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

function resetRateLimit() { attempts.clear(); }

// En Vercel solo se confía en la cabecera que la plataforma reescribe. Fuera de
// Vercel (desarrollo local) se acepta el proxy local o el socket directo.
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
  // Los orígenes locales solo se permiten cuando no se ejecuta en Vercel.
  return process.env.VERCEL !== '1' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

function missingConfig() {
  const env = process.env;
  const missing = [];
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!validEmail(env.RESEND_FROM_EMAIL)) missing.push('RESEND_FROM_EMAIL');
  if (!validEmail(env.CONTACT_TO_EMAIL)) missing.push('CONTACT_TO_EMAIL');
  return missing;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (code, error) => res.status(code).json({ error });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(405, 'Método no permitido.');
  }
  const missing = missingConfig();
  if (missing.length) {
    console.error(`[contact] Configuración incompleta: ${missing.join(', ')}`);
    return fail(500, misconfigured);
  }
  if (!originAllowed(req.headers.origin)) return fail(403, 'Origen no permitido.');
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
  const fields = ['name', 'email', 'subject', 'message', 'website',
    'requestId', 'createdAt'];
  if (Object.keys(body).some(key => !fields.includes(key))) {
    return fail(400, 'Datos inválidos.');
  }
  const { name, email, subject, message, website, requestId, createdAt } = body;
  if (website !== undefined && website !== '') {
    return fail(400, 'Solicitud no válida.');
  }
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100 ||
      /[\x00-\x1f\x7f]/.test(name) || !validEmail(email) ||
      typeof subject !== 'string' || subject.trim().length < 3 ||
      subject.length > 150 || /[\x00-\x1f\x7f]/.test(subject) ||
      typeof message !== 'string' || message.trim().length < 10 ||
      message.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message) ||
      typeof requestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
        .test(requestId) || !Number.isSafeInteger(createdAt) ||
      createdAt > Date.now() + 60000) {
    return fail(400, 'Revisa nombre, correo, asunto y mensaje (10–5000 caracteres).');
  }
  // La ventana termina antes de que Resend olvide la clave (24 horas).
  if (Date.now() - createdAt > retryWindow) {
    return fail(409, 'La solicitud caducó. Comprueba el envío antes de crear otra.');
  }
  const ip = clientIP(req);
  if (!ip) return fail(400, 'No se pudo validar la solicitud.');
  const identity = value => createHash('sha256').update(value).digest('hex');
  const now = Date.now();
  pruneAttempts(now);
  if (!allowed(`ip:${identity(ip)}`, ipLimit, now) ||
      !allowed(`email:${identity(email.toLowerCase())}`, emailLimit, now) ||
      !allowed('global', globalLimit, now)) {
    res.setHeader('Retry-After', '3600');
    return fail(429, 'Límite de envíos alcanzado. Espera un momento antes de reintentar.');
  }

  const env = process.env;
  const payload = {
    from: env.RESEND_FROM_EMAIL, to: [env.CONTACT_TO_EMAIL],
    subject: `[MiPortal] ${subject.trim()}`, reply_to: email,
    text: `Nombre: ${name.trim()}\nCorreo: ${email}\nAsunto: ${subject.trim()}\n\n${message.trim()}`
  };
  // Vincula la clave al contenido, la configuración y el inicio del intento.
  const key = createHash('sha256').update(
    JSON.stringify([requestId.toLowerCase(), createdAt, payload])
  ).digest('hex');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json', 'Idempotency-Key': `contact/${key}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000)
    });
    if (response.status === 429) {
      const seconds = retryAfter(response.headers.get('Retry-After'));
      res.setHeader('Retry-After', String(seconds));
      return fail(429, `Límite de envíos alcanzado. Espera ${seconds} segundos.`);
    }
    if (response.status === 409) {
      res.setHeader('Retry-After', '5');
      return fail(409, 'El envío está en conflicto o en curso. Reintenta más tarde.');
    }
    if (!response.ok) return fail(502, uncertain);
    const result = await response.json();
    if (typeof result?.id !== 'string' || !result.id) return fail(502, uncertain);
    return res.status(202).json({
      message: 'Mensaje aceptado por el servicio de correo. Gracias por escribirnos.'
    });
  } catch (error) {
    return fail(error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 504 : 502, uncertain);
  }
};

module.exports.resetRateLimit = resetRateLimit;
