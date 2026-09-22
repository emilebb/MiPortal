'use strict';
// ============================================================================
// MiPortal — tokens firmados con HMAC (confirmación, baja y novedades).
// Formato: base64url(payload).signature; la firma es HMAC-SHA256 del payload.
// Compartidos por api/newsletter.js y lib/newsletter-dispatch.js.
// ============================================================================
const { createHmac, timingSafeEqual } = require('node:crypto');

function tokenFor(payload, secret) {
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

// Devuelve el payload decodificado si la firma es válida, o null.
function readToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return null; }
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return payload;
}

module.exports = { tokenFor, readToken };