import assert from 'node:assert/strict';
import test from 'node:test';
import { FALLBACK_REPLY, MAX_MESSAGE_LENGTH, requestAssistantReply, safeAssistantUrl, validateAssistantResponse, validateMessage } from '../js/miportal-assistant-api.mjs';
import { mountAssistant, renderAssistantMessage } from '../js/miportal-assistant.mjs';
import { injectAssistantAssets } from './static-build-utils.mjs';

class FakeElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.value = ''; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
  requestSubmit() { return this.listeners.submit?.({ preventDefault() {} }); }
  get scrollHeight() { return this.children.length; }
  getElementById() { return null; }
}

function fakeDocument() {
  const body = new FakeElement('body');
  return {
    body, title: 'Buscar | MiPortal', listeners: {},
    defaultView: { location: { pathname: '/buscar.html', origin: 'https://site.test' } },
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => body.children.find((node) => node.id === id) || null,
    addEventListener(name, callback) { this.listeners[name] = callback; }
  };
}

test('build injection targets public content pages once and leaves account pages alone', () => {
  const source = '<html><head></head><body></body></html>';
  const injected = injectAssistantAssets(source, 'contacto.html');
  assert.equal((injected.match(/data-miportal-assistant="style"/g) || []).length, 1);
  assert.equal((injected.match(/data-miportal-assistant="bootstrap"/g) || []).length, 1);
  assert.equal(injectAssistantAssets(injected, 'contacto.html'), injected);
  assert.equal(injectAssistantAssets(source, 'login.html'), source);
});

test('message validation rejects empty content and enforces its character limit', () => {
  assert.throws(() => validateMessage('  '), /mensaje/i);
  assert.equal(validateMessage('  Hola  '), 'Hola');
  assert.throws(() => validateMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1)), RangeError);
});

test('chat opens, closes with Escape, rejects empty messages, and submits valid messages', async () => {
  const doc = fakeDocument();
  const chat = mountAssistant(doc);
  chat.opener.listeners.click();
  assert.equal(chat.panel.hidden, false);
  assert.equal(chat.opener.attributes['aria-expanded'], 'true');
  assert.equal(chat.textarea.focused, true);
  doc.listeners.keydown({ key: 'Escape' });
  assert.equal(chat.panel.hidden, true);
  assert.equal(chat.opener.focused, true);
  chat.opener.listeners.click();
  await chat.panel.children[2] && chat.panel.children[3].requestSubmit();
  assert.match(chat.panel.children[2].textContent, /Escribe un mensaje/);
  chat.textarea.value = 'noticias';
  await chat.panel.children[3].requestSubmit();
  assert.equal(chat.messages.children.at(-2).children[0].textContent, 'noticias');
  assert.equal(chat.messages.children.at(-1).children[0].textContent, 'Puedes consultar las noticias publicadas en MiPortal.');
  assert.equal(chat.messages.children.at(-1).children[1].children[0].children[0].textContent, 'Ver noticias');
});

test('response schema and URL policy accept safe links and reject unsafe or malformed data', () => {
  assert.equal(safeAssistantUrl('/buscar.html', 'https://site.test').external, false);
  assert.equal(safeAssistantUrl('https://outside.test/page', 'https://site.test').external, true);
  for (const unsafe of ['//outside.test', 'javascript:alert(1)', 'data:text/html,x', '/\\evil', '/%2f%2fevil', '/bad%0a']) assert.equal(safeAssistantUrl(unsafe, 'https://site.test'), null);
  assert.deepEqual(validateAssistantResponse({ reply: 'Hola', links: [{ label: 'Buscar', url: '/buscar.html' }] }, 'https://site.test').links[0], {
    label: 'Buscar', href: 'https://site.test/buscar.html', external: false
  });
  assert.throws(() => validateAssistantResponse({ reply: '<img src=x>', links: [{ label: 'X', url: 'javascript:alert(1)' }] }, 'https://site.test'));
  assert.throws(() => validateAssistantResponse({ reply: 4 }, 'https://site.test'));
});

test('mock mode never fetches; endpoint mode sends the request and validates its response', async () => {
  let called = false;
  const mock = await requestAssistantReply('hola', 'session', { path: '/', title: 'Home' }, { fetch: () => { called = true; } });
  assert.equal(called, false);
  assert.match(mock.reply, /hola/);
  let request;
  const result = await requestAssistantReply('¿Dónde?', 'ephemeral', { path: '/buscar.html', title: 'Buscar' }, {
    config: { mockMode: false, endpoint: '/assistant', timeoutMs: 1000 }, base: 'https://site.test',
    fetch: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ reply: 'Aquí', links: [] }) }; }
  });
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { message: '¿Dónde?', sessionId: 'ephemeral', page: { path: '/buscar.html', title: 'Buscar' } });
  assert.equal(result.reply, 'Aquí');
});

test('non-2xx, invalid JSON, and malformed links reject the backend response', async () => {
  const options = { config: { mockMode: false, endpoint: '/assistant' }, base: 'https://site.test' };
  await assert.rejects(requestAssistantReply('hola', 'id', {}, {
    ...options, fetch: async () => ({ ok: false, status: 503 })
  }), /503/);
  await assert.rejects(requestAssistantReply('hola', 'id', {}, {
    ...options, fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid json'); } })
  }), SyntaxError);
  assert.throws(() => validateAssistantResponse({ reply: 'Hola', links: [{ label: 3, url: '/buscar.html' }] }, 'https://site.test'));
  assert.throws(() => validateAssistantResponse({ reply: 'Hola', links: {} }, 'https://site.test'));
});

test('network, timeout, and malformed response errors are available for the shared UI fallback', async () => {
  const options = { config: { mockMode: false, endpoint: '/assistant', timeoutMs: 10 }, fetch: async () => { throw new Error('offline'); } };
  await assert.rejects(requestAssistantReply('hola', 'id', {}, options), /offline/);
  await assert.rejects(requestAssistantReply('hola', 'id', {}, {
    config: options.config, fetch: async () => ({ ok: true, json: async () => ({ reply: '' }) })
  }));
  await assert.rejects(requestAssistantReply('hola', 'id', {}, {
    config: { mockMode: false, endpoint: '/assistant', timeoutMs: 5 },
    fetch: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
  }), { name: 'AbortError' });
  assert.equal(FALLBACK_REPLY, 'Ahora mismo no pude procesar tu pregunta. Puedes usar la búsqueda de MiPortal para encontrar lo que necesitas.');
});

test('assistant reply and link labels render as text, never as HTML', () => {
  const doc = fakeDocument();
  const messages = new FakeElement('div');
  const item = renderAssistantMessage(messages, '<img src=x onerror=alert(1)>', 'assistant', [
    { label: '<svg onload=alert(1)>', href: 'https://site.test/buscar.html', external: false }
  ], doc);
  assert.equal(item.children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(item.children[1].children[0].children[0].textContent, '<svg onload=alert(1)>');
  assert.equal(item.children[0].children.length, 0);
  assert.equal(item.children[1].children[0].children[0].tagName, 'a');
});
