// ============================================================================
// MiPortal · Disparo de novedades por correo al publicar contenido.
// ----------------------------------------------------------------------------
// POST /api/newsletter-send   (sin botón manual: lo invoca el panel admin
// automáticamente justo después de que la publicación quedó guardada).
//
// Protección:
//   - exige un JWT de Supabase válido de un perfil con rol 'admin';
//   - throttle global por hora en base de datos (reserve_dispatch_call);
//   - la cola y los envíos son idempotentes en la base: repetir la llamada no
//     produce correos duplicados, aunque dos pestañas lo disparen a la vez.
// Nada de esta lógica vive en el navegador.
// ============================================================================
const { createHmac } = require('node:crypto');
const { config, drainPending } = require('../lib/newsletter-dispatch');

const maxBytes = 2000;
const deadlineMs = 7000;

function fail(res, status, error) {
  return res.status(status).json({ error });
}

async function verifyClient(configured, token) {
  if (typeof token !== 'string' || token === '') return null;
  let response;
  try {
    response = await fetch(`${configured.database.origin}/auth/v1/user`, {
      method: 'GET', redirect: 'error',
      headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000)
    });
  } catch (error) {
    console.error(`[newsletter-send] Verificación de sesión: ${error?.name ?? error}`);
    return null;
  }
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function isAdmin(configured, uid) {
  const response = await fetch(
    `${configured.database.origin}/rest/v1/rpc/user_is_admin`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${configured.env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ p_uid: uid }), signal: AbortSignal.timeout(5000)
    });
  if (!response.ok) return false;
  const result = await response.json();
  return result === true;
}

async function reserveCall(configured, uid) {
  const senderHash = createHmac('sha256', configured.env.NEWSLETTER_HASH_SECRET)
    .update(`uid:${uid}`).digest('hex');
  const response = await fetch(
    `${configured.database.origin}/rest/v1/rpc/reserve_dispatch_call`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: configured.env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${configured.env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ p_sender_hash: senderHash }),
      signal: AbortSignal.timeout(5000)
    });
  if (!response.ok) return false;
  const result = await response.json();
  return result?.allowed === true;
}

function authenticationHeader(req) {
  const value = req.headers['authorization'];
  if (typeof value !== 'string') return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const failWith = (status, error) => fail(res, status, error);

  if (req.method === 'GET') {
    return res.status(200).send('ok');
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return failWith(405, 'Método no permitido.');
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw) || '') > maxBytes) {
    return failWith(413, 'Solicitud demasiado grande.');
  }
  let body = {};
  try {
    body = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  } catch {
    return failWith(400, 'Datos inválidos.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'resourceId') ||
      body.resourceId !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.resourceId))) {
    return failWith(400, 'Solicitud no válida.');
  }

  const configured = config();
  if (configured.missing.length) {
    console.error(`[newsletter-send] Configuración incompleta: ${configured.missing.join(', ')}`);
    return failWith(500, 'El servicio de novedades no está configurado. Avisa al administrador del sitio.');
  }

  const uid = await verifyClient(configured, authenticationHeader(req));
  if (!uid) return failWith(401, 'No autorizado.');
  if (!(await isAdmin(configured, uid))) return failWith(403, 'Solo los administradores pueden enviar novedades.');
  if (!(await reserveCall(configured, uid))) {
    res.setHeader('Retry-After', '3600');
    return failWith(429, 'Demasiadas solicitudes. Probá más tarde.');
  }

  try {
    const summary = await drainPending(configured, {
      resourceId: body.resourceId || undefined,
      deadlineMs
    });
    console.error(safeLine(`[newsletter-send] Envíos procesados: ${summary.handled} publicación(es), ${summary.sent} correos enviados, ${summary.failed} fallaron.`));
    return res.status(202).json({
      ok: true,
      handled: summary.handled,
      sent: summary.sent,
      failed: summary.failed,
      enabled: configured.env.NEWSLETTER_SEND_ENABLED === 'true'
    });
  } catch (error) {
    console.error(safeLine(`[newsletter-send] Error al procesar: ${error?.context || ''} ${error?.status || ''} ${String(error?.detail ?? error?.message ?? error).slice(0, 300)}`));
    return failWith(503, 'El envío de novedades no pudo completarse ahora. Se reintentará automáticamente.');
  }
};

function safeLine(line) {
  let out = line;
  for (const value of [process.env.RESEND_API_KEY, process.env.SUPABASE_SECRET_KEY,
    process.env.NEWSLETTER_HASH_SECRET]) {
    if (typeof value === 'string' && value.length >= 8) out = out.split(value).join('***');
  }
  return out;
}