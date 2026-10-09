const UPSTREAM = 'https://n8n.miportal.me/webhook/miportal-assistant';
const UPSTREAM_SECRET_ENV = 'N8N_ASSISTANT_WEBHOOK_SECRET';
const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;
const ipMinuteLimit = 5;
const ipHourLimit = 20;
const ipDayLimit = 40;
const sessionDayLimit = 5;
// Best-effort process-local guard, matching the existing contact/newsletter APIs.
// It does not store message content and expires request timestamps after 24 h.
const requestsByKey = new Map();
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
  if (typeof trusted === 'string') return trusted.split(',')[0].trim().slice(0, 64) || 'unknown';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim().slice(0, 64) || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
}

function pruneRateData(now) {
  for (const [key, times] of requestsByKey) {
    const recent = times.filter(time => time > now - day);
    if (recent.length) requestsByKey.set(key, recent);
    else requestsByKey.delete(key);
  }
  while (requestsByKey.size > 2048) requestsByKey.delete(requestsByKey.keys().next().value);
}

function reserveRateLimit(ip, sessionId, now = Date.now()) {
  pruneRateData(now);
  const keys = [`ip:${ip}`];
  if (sessionId) keys.push(`session:${ip}:${sessionId}`);
  const limits = [ipMinuteLimit, ipHourLimit, ipDayLimit, sessionDayLimit];
  const windows = [minute, hour, day, day];
  for (let index = 0; index < keys.length; index++) {
    const times = requestsByKey.get(keys[index]) || [];
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex++) {
      const recent = times.filter(time => time > now - windows[windowIndex]);
      if (recent.length >= limits[windowIndex]) {
        const oldest = recent[0];
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((oldest + windows[windowIndex] - now) / 1000)) };
      }
    }
  }
  for (const key of keys) {
    const times = requestsByKey.get(key) || [];
    times.push(now);
    requestsByKey.set(key, times);
  }
  return { allowed: true };
}

function safePage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const path = typeof value.path === 'string' && value.path.startsWith('/') &&
    !value.path.startsWith('//') ? value.path.slice(0, 200) : undefined;
  const title = typeof value.title === 'string' ? value.title.trim().slice(0, 120) : undefined;
  return path || title ? { ...(path ? { path } : {}), ...(title ? { title } : {}) } : undefined;
}

function classifyUpstreamError(data, status) {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 404) return 'route-not-found';
  if (status === 408 || status === 504) return 'timeout';
  const parts = [data?.message, data?.error, data?.name, data?.error?.message]
    .filter(value => typeof value === 'string').join(' ').toLowerCase();
  if (/enotfound|eai_again|dns/.test(parts)) return 'dns';
  if (/certificate|tls|ssl/.test(parts)) return 'tls';
  if (/timeout|timed out|aborterror/.test(parts)) return 'timeout';
  if (/credential|header auth|unauthori[sz]ed|forbidden/.test(parts)) return 'authentication';
  if (/webhook|not found/.test(parts)) return 'route-or-webhook';
  if (/supabase|postgrest/.test(parts)) return 'data-service';
  if (status >= 500) return 'upstream-application-5xx';
  return 'other-upstream-error';
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
  const rate = reserveRateLimit(clientIp(req), sessionId);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return respond(res, 429, { reply: 'Has enviado varias preguntas en poco tiempo. Inténtalo más tarde.', links: [] });
  }
  const page = safePage(body.page);

  // Fail closed until the shared server-to-server credential is configured.
  // This keeps the n8n webhook inaccessible to direct unauthenticated callers.
  const upstreamSecret = process.env[UPSTREAM_SECRET_ENV];
  if (typeof upstreamSecret !== 'string' || upstreamSecret.length < 32) {
    return respond(res, 503, fallback);
  }

  const upstreamUrl = new URL(UPSTREAM);
  const startedAt = Date.now();
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
    let validJson = true;
    try { data = await upstream.json(); } catch { data = null; validJson = false; }
    const validReply = typeof data?.reply === 'string' && Boolean(data.reply.trim());
    const payloadText = data && typeof data === 'object' ? JSON.stringify(data) : '';
    const errorMessage = typeof data?.message === 'string' ? data.message.trim() : '';
    const safeErrorMessage = !validReply && errorMessage &&
      !payloadText.includes(upstreamSecret) &&
      !/(?:bearer|token|secret|credential|password|api[_ -]?key)\s*[:=]/i.test(errorMessage) &&
      !/https?:\/\/\S+/i.test(errorMessage) &&
      !/[A-Za-z0-9_-]{40,}/.test(errorMessage)
      ? errorMessage.slice(0, 240)
      : undefined;
    console.info('[assistant-upstream-diagnostic]', {
      status: upstream.status,
      statusText: upstream.statusText,
      hostname: upstreamUrl.hostname,
      path: upstreamUrl.pathname,
      elapsedMs: Date.now() - startedAt,
      validJson,
      validReply,
      ...(validReply ? {} : {
        errorCategory: classifyUpstreamError(data, upstream.status),
        payloadKeys: data && typeof data === 'object' && !Array.isArray(data)
          ? Object.keys(data).slice(0, 20) : [],
        payloadIsArray: Array.isArray(data),
        ...(safeErrorMessage ? { safeErrorMessage } : {})
      })
    });
    if (!validReply) {
      return respond(res, upstream.ok ? 502 : upstream.status, fallback);
    }
    return respond(res, upstream.status, data);
  } catch (error) {
    console.error('[assistant-upstream-diagnostic]', {
      hostname: upstreamUrl.hostname,
      path: upstreamUrl.pathname,
      elapsedMs: Date.now() - startedAt,
      errorName: error?.name || 'Error'
    });
    return respond(res, 502, fallback);
  }
};

module.exports.resetRateLimitsForTests = () => requestsByKey.clear();
