const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');
const { verifyUser, databaseConfig } = require('../lib/server-auth');
const UPSTREAM = 'https://n8n.miportal.me/webhook/miportal-assistant';
const UPSTREAM_SECRET_ENV = 'N8N_ASSISTANT_WEBHOOK_SECRET';
const fallback = {
  reply: 'Ahora mismo no pude procesar tu pregunta. Puedes usar la búsqueda de MiPortal para encontrar lo que necesitas.',
  links: [{ label: 'Buscar en MiPortal', url: '/buscar.html' }]
};

function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function clientIp(req) {
  const trusted = req.headers?.['x-vercel-forwarded-for'];
  if (typeof trusted === 'string' && isIP(trusted)) return trusted;
  if (process.env.VERCEL === '1') return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && isIP(forwarded.split(',')[0].trim())) return forwarded.split(',')[0].trim();
  return isIP(req.socket?.remoteAddress || '') ? req.socket.remoteAddress : null;
}

function safePage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const path = typeof value.path === 'string' && value.path.startsWith('/') &&
    !value.path.startsWith('//') ? value.path.slice(0, 200) : undefined;
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 120) : undefined;
  return path || title ? { ...(path ? { path } : {}), ...(title ? { title } : {}) } : undefined;
}

module.exports = async function assistant(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { reply: 'Método no permitido.', links: [] });
  }
  const contentType = req.headers?.['content-type'] || req.headers?.['Content-Type'] || '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return respond(res, 415, { reply: 'Envía la pregunta en formato JSON.', links: [] });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {
      return respond(res, 400, { reply: 'El cuerpo de la solicitud no es JSON válido.', links: [] });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respond(res, 400, { reply: 'El cuerpo de la solicitud debe ser un objeto JSON.', links: [] });
  }
  if (typeof body.message !== 'string') {
    return respond(res, 400, { reply: 'El campo message debe ser texto.', links: [] });
  }
  const message = body.message.trim();
  if (!message) return respond(res, 400, { reply: 'Escribe un mensaje para continuar.', links: [] });
  if (message.length > 1000) {
    return respond(res, 400, { reply: 'El mensaje no puede superar 1.000 caracteres.', links: [] });
  }

  const sessionId = typeof body.sessionId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.sessionId)
    ? body.sessionId : undefined;
  const page = safePage(body.page);

  // Fail closed until the shared server-to-server credential is configured.
  // This keeps the n8n webhook inaccessible to direct unauthenticated callers.
  const upstreamSecret = process.env[UPSTREAM_SECRET_ENV];
  if (typeof upstreamSecret !== 'string' || upstreamSecret.length < 32) {
    return respond(res, 503, fallback);
  }

  const configured = databaseConfig();
  const ip = clientIp(req);
  if (!configured || !process.env.SUPABASE_SECRET_KEY) return respond(res, 503, fallback);
  if (!ip) return respond(res, 400, { reply: 'No pudimos validar la conexión.', links: [] });
  let userId = null;
  if (req.headers?.authorization !== undefined) {
    const identity = await verifyUser(req);
    if (identity.status) return respond(res, identity.status, { reply: 'No pudimos verificar tu sesión. Vuelve a iniciar sesión.', links: [] });
    userId = identity.user.id;
  } else if (!sessionId) return respond(res, 400, { reply: 'Recarga la página para iniciar una conversación.', links: [] });

  try {
    const hash = value => createHmac('sha256', upstreamSecret).update(value).digest('hex');
    const quotaResponse = await fetch(`${configured.database.origin}/rest/v1/rpc/reserve_assistant_request`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { apikey: process.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_session_hash: userId ? null : hash(`session:${ip}:${sessionId}`), p_ip_hash: hash(`ip:${ip}`) })
    });
    if (!quotaResponse.ok) return respond(res, 503, fallback);
    const quota = await quotaResponse.json();
    if (quota?.allowed === false) {
      res.setHeader('Retry-After', String(Math.min(86400, Math.max(1, Number(quota.retry_after) || 60))));
      return respond(res, 429, { reply: 'Alcanzaste el límite de consultas. Vuelve a intentarlo más tarde.', links: [] });
    }
    if (quota?.allowed !== true) return respond(res, 503, fallback);
  } catch { return respond(res, 503, fallback); }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MiPortal-Assistant-Secret': upstreamSecret
      },
      body: JSON.stringify({ message, ...(sessionId ? { sessionId } : {}), ...(page ? { page } : {}) }),
      signal: AbortSignal.timeout(14_500),
      redirect: 'error'
    });
    let data;
    try { data = await upstream.json(); } catch { data = null; }
    if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
      return respond(res, upstream.ok ? 502 : upstream.status, fallback);
    }
    return respond(res, upstream.status, data);
  } catch {
    return respond(res, 502, fallback);
  }
};
