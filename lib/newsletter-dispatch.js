'use strict';
// ============================================================================
// MiPortal — envío de novedades por correo (solo servidor).
// ----------------------------------------------------------------------------
// Responsabilidades separadas:
//   - obtener suscriptores confirmados       → confirmedSubscribers()
//   - deduplicar por publicación + suscriptor → pendingRecipients()
//   - generar correo HTML                    → lib/emails.js (buildNewsEmail)
//   - lotes de ≤100 y reintentos seguros     → sendBatch()
//   - estado de la cola (pending/processing/sent/failed/skipped)
//   - logs útiles sin exponer secretos ni correos completos
// Consumido por api/newsletter-send.js.
// ============================================================================
const { createHmac } = require('node:crypto');
const { buildNewsEmail } = require('./emails');
const { tokenFor } = require('./tokens');

const BATCH_SIZE = 100;                 // máx. admitido por POST /emails/batch
const MAX_BATCH_ATTEMPTS = 3;           // reintentos por lote (mismo idempotency key)
const BATCH_DELAY_MS = 400;             // respiro entre lotes (rate limit 10 req/s)
const STALE_AFTER_SECONDS = 900;        // un 'processing' huérfano se recupera a los 15 min
const MAX_DISPATCHES_PER_CALL = 5;      // cola procesada por invocación
const DEFAULT_DEADLINE_MS = 7000;       // margen para no superar el timeout de Vercel
const UNSUBSCRIBE_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const RPC_TIMEOUT_MS = 8000;
const SEND_TIMEOUT_MS = 15000;

const SITE_URL = 'https://www.miportal.me';

function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[0].length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(parts[0]) &&
    parts[1].includes('.') && parts[1].split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function config(envSource = process.env) {
  const env = envSource || {};
  const missing = [];
  let database = null;
  try { database = new URL(env.SUPABASE_URL); } catch { database = null; }
  if (!database || database.protocol !== 'https:' || database.username ||
      database.password || database.pathname !== '/') missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
  if (typeof env.NEWSLETTER_HASH_SECRET !== 'string' || env.NEWSLETTER_HASH_SECRET.length < 32) missing.push('NEWSLETTER_HASH_SECRET');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!validEmail(env.RESEND_FROM_EMAIL)) missing.push('RESEND_FROM_EMAIL');
  return { env, database, missing };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function positiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Intervalo entre lotes respetando el rate limit de Resend (10 req/s).
function batchDelayMs() {
  return positiveEnv('NEWSLETTER_BATCH_DELAY_MS', BATCH_DELAY_MS);
}

// Espera antes de reintentar un lote: base geométrica (2^n) o Retry-After.
function retryBackoffSeconds(attempt, headers) {
  const baseMs = positiveEnv('NEWSLETTER_RETRY_BACKOFF_MS', 1000);
  const retryAfter = Number(headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 15);
  return Math.min((2 ** attempt) * baseMs / 1000, 8);
}

function redact(line, env) {
  let out = line;
  for (const value of [env.RESEND_API_KEY, env.SUPABASE_SECRET_KEY, env.NEWSLETTER_HASH_SECRET]) {
    if (typeof value === 'string' && value.length >= 8) out = out.split(value).join('***');
  }
  return out;
}

function log(env, message) {
  console.error(redact(`[newsletter-send] ${message}`, env));
}

function shorten(text, max = 400) {
  if (typeof text !== 'string') return String(text ?? '');
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

function hashOf(value, env) {
  return createHmac('sha256', env.NEWSLETTER_HASH_SECRET).update(value).digest('hex');
}

function unsubscribeUrlFor(emailHash, env) {
  const payload = `${emailHash}.${Date.now() + UNSUBSCRIBE_LIFETIME_MS}`;
  return `${SITE_URL}/api/newsletter?action=unsubscribe&token=${encodeURIComponent(tokenFor(payload, env.NEWSLETTER_HASH_SECRET))}`;
}

// ----------------------------------------------------------------------------
// Acceso a Supabase (siempre RPC security definer, service_role)
// ----------------------------------------------------------------------------
async function rpc(configured, name, payload) {
  const response = await fetch(
    `${configured.database.origin}/rest/v1/rpc/${name}`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${configured.env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
    });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { }
    const error = new Error(`${name} respondió ${response.status}`);
    error.context = `Supabase ${name}`;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return response.json();
}

async function confirmedSubscribers(configured) {
  const rows = await rpc(configured, 'list_confirmed_subscribers', {});
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => typeof row?.email === 'string' &&
    typeof row?.email_hash === 'string' && /^[a-f0-9]{64}$/.test(row.email_hash));
}

async function sentForResource(configured, resourceId) {
  const rows = await rpc(configured, 'list_newsletter_sent', { p_resource_id: resourceId });
  const map = new Map();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row?.email_hash) {
        map.set(row.email_hash, { status: row.status, attempts: Number(row.attempts) || 0 });
      }
    }
  }
  return map;
}

// Solo pendientes reales: nunca quienes ya figuren como enviados; a los que
// fallaron se les permite reintentar hasta MAX_BATCH_ATTEMPTS.
function pendingRecipients(confirmed, sent, maxAttempts) {
  return confirmed.filter(({ email_hash }) => {
    const record = sent.get(email_hash);
    if (!record) return true;
    if (record.status === 'sent') return false;
    return record.attempts < maxAttempts;
  });
}

// ----------------------------------------------------------------------------
// Construcción del correo (per-destinatario: enlace de baja único y firmado)
// ----------------------------------------------------------------------------
function buildNewsMail(configured, resource, recipientEmail, env) {
  const unsubscribeUrl = unsubscribeUrlFor(
    hashOf(recipientEmail, env), env);
  const mail = buildNewsEmail({
    title: resource.title,
    description: resource.description,
    url: resource.url,
    date: resource.created_at,
    imageUrl: resource.image_url,
    unsubscribeUrl
  });
  return {
    from: `MiPortal <${env.RESEND_FROM_EMAIL}>`,
    to: [recipientEmail],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };
}

// ----------------------------------------------------------------------------
// Envío por lotes con idempotencia y reintentos seguros
// ----------------------------------------------------------------------------
async function sendBatch(configured, idempotencyKey, emails) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${configured.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(emails), signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
      });
      if (response.ok) {
        const result = await response.json();
        return { ok: true, result: Array.isArray(result) ? result : [] };
      }
      let detail = '';
      try { detail = await response.text(); } catch { }
      const retryable = response.status === 429 || response.status >= 500 || response.status === 409;
      lastError = { status: response.status, detail: shorten(redact(detail, configured.env)) };
      if (!retryable) return { ok: false, permanent: true, error: lastError };
      await sleep(retryBackoffSeconds(attempt, response.headers) * 1000);
    } catch (error) {
      lastError = { status: 0, detail: shorten(redact(error?.message ?? error, configured.env)) };
      await sleep(retryBackoffSeconds(attempt) * 1000);
    }
  }
  return { ok: false, permanent: false, error: lastError };
}

async function recordSends(configured, dispatchId, resourceId, results) {
  await rpc(configured, 'record_newsletter_sends',
    { p_dispatch_id: dispatchId, p_resource_id: resourceId, p_results: results });
}

async function completeDispatch(configured, dispatchId, status, sent, failed, total, errorText) {
  await rpc(configured, 'complete_newsletter_dispatch',
    { p_dispatch_id: dispatchId, p_status: status, p_sent: sent,
      p_failed: failed, p_total: total,
      p_error: errorText ? redact(shorten(errorText, 500), configured.env) : null });
}

// ----------------------------------------------------------------------------
// Procesar una publicación encolada
// ----------------------------------------------------------------------------
async function processDispatch(configured, dispatch) {
  const env = configured.env;
  const resource = dispatch.resource_snapshot || {};
  const resourceId = dispatch.resource_id;
  const title = String(resource.title || '').slice(0, 60);
  log(env, `Newsletter iniciada para publicación ${resourceId} ("${title}")`);

  // ── Modo prueba (desarrollo): NUNCA envía a suscriptores reales ──────────
  if (env.NEWSLETTER_SEND_ENABLED !== 'true') {
    log(env, `modo test (publicación ${resourceId})`);
    const testEmail = (env.NEWSLETTER_TEST_EMAIL || '').trim().toLowerCase();
    if (validEmail(testEmail)) {
      log(env, `enviando a NEWSLETTER_TEST_EMAIL (publicación ${resourceId})`);
      const mail = buildNewsMail(configured, resource, testEmail, env);
      const outcome = await sendBatch(configured, `newsletter/test/${dispatch.id}`, [mail]);
      if (outcome.ok) {
        log(env, `enviado correctamente (publicación ${resourceId})`);
      } else {
        log(env, `ERROR: ${outcome.error.status} ${outcome.error.detail} (publicación ${resourceId})`);
      }
      await completeDispatch(configured, dispatch.id, 'skipped', 0, 0, 0,
        outcome.ok ? null : `falló el envío de prueba (${outcome.error.status})`);
    } else {
      log(env, `modo test sin NEWSLETTER_TEST_EMAIL configurado; nada enviado (publicación ${resourceId})`);
      await completeDispatch(configured, dispatch.id, 'skipped', 0, 0, 0, null);
    }
    return { sent: 0, failed: 0, skipped: true };
  }

  // ── Envío real ───────────────────────────────────────────────────────────
  try {
    const confirmed = await confirmedSubscribers(configured);
    if (!confirmed.length) {
      log(env, `No hay suscriptores confirmados para ${resourceId}; envío marcado como vacío`);
      await completeDispatch(configured, dispatch.id, 'sent', 0, 0, 0, null);
      return { sent: 0, failed: 0, skipped: true };
    }
    const sent = await sentForResource(configured, resourceId);
    const recipients = pendingRecipients(confirmed, sent, MAX_BATCH_ATTEMPTS);
    const total = confirmed.length;
    log(env, `${recipients.length} destinatarios pendientes de ${total} confirmados (publicación ${resourceId})`);
    if (!recipients.length) {
      await completeDispatch(configured, dispatch.id, 'sent', 0, 0, total, null);
      return { sent: 0, failed: 0, skipped: true };
    }

    let sentCount = 0;
    let failedCount = 0;
    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const chunk = recipients.slice(start, start + BATCH_SIZE);
      const batchIndex = start / BATCH_SIZE;
      const emails = chunk.map(({ email }) => buildNewsMail(configured, resource, email, env));
      const outcome = await sendBatch(configured, `newsletter/outbound/${dispatch.id}/${batchIndex}`, emails);
      const results = chunk.map(({ email_hash }, index) => {
        if (outcome.ok) {
          return { email_hash, status: 'sent', resend_id: outcome.result[index]?.id || null, error: null };
        }
        return { email_hash, status: 'failed', resend_id: null,
          error: `lote ${batchIndex}: ${outcome.error.status} ${outcome.error.detail}`.slice(0, 300) };
      });
      await recordSends(configured, dispatch.id, resourceId, results);
      sentCount += outcome.ok ? chunk.length : 0;
      failedCount += outcome.ok ? 0 : chunk.length;
      if (start + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
    }

    const status = failedCount === 0 ? 'sent' : 'failed';
    await completeDispatch(configured, dispatch.id, status, sentCount, failedCount, total,
      failedCount ? `${failedCount} destinatario(s) no recibieron la novedad tras ${MAX_BATCH_ATTEMPTS} intentos` : null);
    log(env, `${recipients.length} destinatarios procesados, ${sentCount} enviados correctamente, ${failedCount} fallaron (publicación ${resourceId})`);
    return { sent: sentCount, failed: failedCount, skipped: false };
  } catch (error) {
    // Fallo de infraestructura o de base: NO se completa el envío. Queda como
    // 'processing' y la reclamación con antigüedad (>15 min) lo reintenta sin
    // duplicar a quienes ya hayan sido registrados como enviados.
    log(env, `Error inesperado procesando ${resourceId}: ${error?.context || ''} ${error?.status || ''} ${shorten(error?.detail || error?.message || error)}`);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Drenar la cola dentro del presupuesto de tiempo de la invocación
// ----------------------------------------------------------------------------
async function drainPending(configured, options = {}) {
  let handled = 0;
  let sent = 0;
  let failed = 0;
  const started = Date.now();
  const deadline = Number.isFinite(options.deadlineMs) ? options.deadlineMs : DEFAULT_DEADLINE_MS;
  let priorityResourceId = options.resourceId || null;

  while (handled < MAX_DISPATCHES_PER_CALL) {
    if (Date.now() - started > deadline) {
      log(configured.env, 'Presupuesto de tiempo agotado; quedan envíos pendientes para la próxima invocación');
      break;
    }
    const dispatch = await rpc(configured, 'claim_newsletter_dispatch', {
      p_resource_id: priorityResourceId, p_stale_after_seconds: STALE_AFTER_SECONDS
    });
    if (!dispatch?.id) break;
    handled += 1;
    priorityResourceId = null;
    // Trazabilidad en Vercel: qué publicación quedó publicado y se procesa.
    console.error(`[newsletter-dispatch] recurso publicado: ${dispatch.resource_id}`);
    log(configured.env, `procesando publicación ${dispatch.resource_id}`);
    const result = await processDispatch(configured, dispatch);
    sent += result.sent;
    failed += result.failed;
  }
  return { handled, sent, failed };
}

module.exports = {
  config, validEmail, drainPending, processDispatch,
  confirmedSubscribers, sentForResource, pendingRecipients,
  BATCH_SIZE, MAX_BATCH_ATTEMPTS, SITE_URL
};