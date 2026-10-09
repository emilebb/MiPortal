import { createMockResponse } from './miportal-assistant-mock.mjs';

export const ASSISTANT_CONFIG = Object.freeze({ mockMode: false, endpoint: '/api/assistant', timeoutMs: 15_000 });
export const MAX_MESSAGE_LENGTH = 1000;
export const FALLBACK_REPLY = 'Ahora mismo no pude procesar tu pregunta. Puedes usar la búsqueda de MiPortal para encontrar lo que necesitas.';

export function validateMessage(message) {
  if (typeof message !== 'string') throw new TypeError('El mensaje debe ser texto.');
  const clean = message.trim();
  if (!clean) throw new TypeError('Escribe un mensaje para continuar.');
  if (clean.length > MAX_MESSAGE_LENGTH) throw new RangeError(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`);
  return clean;
}

export function safeAssistantUrl(value, base = globalThis.location?.origin || 'https://miportal.me') {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f\\]/.test(value) || /%0[0-9a-f]|%1[0-9a-f]|%5c|%2f/i.test(value)) return null;
  if (value.startsWith('//') || value.startsWith('\\\\')) return null;
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!/^(?:https?:\/\/|\/|\.\/|\.\.\/|#|\?)/i.test(value)) return null;
    return { href: url.href, external: url.origin !== new URL(base).origin };
  } catch { return null; }
}

export function validateAssistantResponse(data, base) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new TypeError('Respuesta inválida del asistente.');
  }
  if (data.links !== undefined && (!Array.isArray(data.links) || data.links.some((link) =>
    !link || typeof link !== 'object' || typeof link.label !== 'string' || !link.label.trim() || typeof link.url !== 'string' || !safeAssistantUrl(link.url, base)))) {
    throw new TypeError('Enlaces inválidos en la respuesta.');
  }
  return { reply: data.reply, links: (data.links || []).map(({ label, url }) => ({ label, ...safeAssistantUrl(url, base) })) };
}

export async function requestAssistantReply(message, sessionId, page, options = {}) {
  const clean = validateMessage(message);
  const config = options.config || ASSISTANT_CONFIG;
  const base = options.base || globalThis.location?.origin || 'https://miportal.me';
  if (config.mockMode) return validateAssistantResponse(createMockResponse(clean), base);
  if (!config.endpoint) throw new Error('El endpoint del asistente no está configurado.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 15_000);
  try {
    const response = await (options.fetch || fetch)(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ message: clean, sessionId, page })
    });
    if (!response.ok) throw new Error(`El endpoint respondió ${response.status}.`);
    return validateAssistantResponse(await response.json(), base);
  } finally { clearTimeout(timer); }
}
