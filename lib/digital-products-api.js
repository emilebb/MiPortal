'use strict';

const allowedOrigins = new Set([
  'https://www.miportal.me',
  'https://miportal.me',
  'https://mi-portal-seven.vercel.app'
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxBodyBytes = 8192;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function originAllowed(origin) {
  if (typeof origin !== 'string') return false;
  if (allowedOrigins.has(origin)) return true;
  return process.env.VERCEL !== '1' &&
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

function readConfig({ needsSecret = true, needsMercadoPago = false, needsWebhook = false } = {}) {
  const env = process.env;
  let database = null;
  try { database = new URL(env.SUPABASE_URL); } catch { }
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  const missing = [];
  if (!database || database.protocol !== 'https:' || database.pathname !== '/' || database.search || database.hash) missing.push('SUPABASE_URL');
  if (!publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (needsSecret && !env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
  if (needsMercadoPago && !env.MERCADOPAGO_ACCESS_TOKEN) missing.push('MERCADOPAGO_ACCESS_TOKEN');
  if (needsWebhook && !env.MERCADOPAGO_WEBHOOK_SECRET) missing.push('MERCADOPAGO_WEBHOOK_SECRET');
  return { env, database, publishableKey, missing };
}

function readJsonBody(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return { error: { status: 415, message: 'Formato no permitido.' } };
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  let byteLength = 0;
  try { byteLength = Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)); } catch { }
  if (byteLength > maxBodyBytes) {
    return { error: { status: 413, message: 'La solicitud es demasiado grande.' } };
  }
  if (raw == null) return { error: { status: 400, message: 'Datos inválidos.' } };
  try {
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return { body };
  } catch {
    return { error: { status: 400, message: 'Datos inválidos.' } };
  }
}

function bearerToken(req) {
  const value = req.headers.authorization;
  const match = typeof value === 'string' && value.match(/^Bearer ([^\s]{20,4096})$/i);
  return match?.[1] || null;
}

async function getUser(req, config) {
  const accessToken = bearerToken(req);
  if (!accessToken) return null;
  try {
    const response = await fetch(`${config.database.origin}/auth/v1/user`, {
      method: 'GET', redirect: 'error',
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user?.id === 'string' && uuidPattern.test(user.id) ? { ...user, accessToken } : null;
  } catch { return null; }
}

function createServiceClient(config) {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(config.database.origin, config.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args) => fetch(...args) }
  });
}

function configError(config, res) {
  if (!config.missing.length) return false;
  console.error(`[digital-products] server configuration missing: ${config.missing.join(',')}`);
  json(res, 503, { error: 'La tienda no está configurada.' });
  return true;
}

function methodNotAllowed(req, res, method) {
  if (req.method === method) return false;
  res.setHeader('Allow', method);
  json(res, 405, { error: 'Método no permitido.' });
  return true;
}

function requireOrigin(req, res) {
  if (originAllowed(req.headers.origin)) return false;
  json(res, 403, { error: 'Origen no permitido.' });
  return true;
}

function requireCheckoutEnabled(res) {
  if (process.env.DIGITAL_PRODUCTS_CHECKOUT_ENABLED === 'true') return false;
  json(res, 503, { error: 'La compra de productos digitales todavía no está habilitada.' });
  return true;
}

module.exports = {
  createServiceClient, configError, getUser, json, methodNotAllowed, originAllowed,
  readConfig, readJsonBody, requireCheckoutEnabled, requireOrigin, uuidPattern
};
