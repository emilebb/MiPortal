import { FALLBACK_REPLY, MAX_MESSAGE_LENGTH, requestAssistantReply, validateMessage } from './miportal-assistant-api.mjs';

const welcome = 'Hola 👋 Soy el asistente de MiPortal. Puedo ayudarte a encontrar noticias, tutoriales, recursos y otras secciones del sitio. ¿Qué estás buscando?';
const element = (tag, className, text, doc = document) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderAssistantMessage(messages, text, role, links = [], doc = document) {
  const item = element('article', `mp-assistant__message mp-assistant__message--${role}`, undefined, doc);
  item.append(element('p', '', text, doc));
  if (links.length) {
    const list = element('ul', 'mp-assistant__links', undefined, doc);
    for (const link of links) {
      const li = element('li', '', undefined, doc);
      const anchor = element('a', '', link.label, doc);
      anchor.href = link.href;
      if (link.external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
      li.append(anchor);
      list.append(li);
    }
    item.append(list);
  }
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function sessionId() {
  return globalThis.crypto?.randomUUID?.() || `mp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function mountAssistant(doc = document) {
  if (doc.getElementById('miportal-assistant')) return;
  const root = element('section', 'mp-assistant', undefined, doc);
  root.id = 'miportal-assistant';
  const opener = element('button', 'mp-assistant__open', '💬', doc);
  opener.type = 'button'; opener.title = 'Asistente MiPortal'; opener.setAttribute('aria-label', 'Abrir asistente de MiPortal');
  opener.setAttribute('aria-expanded', 'false'); opener.setAttribute('aria-controls', 'mp-assistant-panel');
  const panel = element('section', 'mp-assistant__panel', undefined, doc);
  panel.id = 'mp-assistant-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'mp-assistant-title'); panel.setAttribute('aria-modal', 'false');
  const header = element('header', 'mp-assistant__header', undefined, doc);
  const title = element('h2', '', 'Asistente MiPortal', doc); title.id = 'mp-assistant-title';
  const close = element('button', 'mp-assistant__close', 'Cerrar', doc); close.type = 'button'; close.setAttribute('aria-label', 'Cerrar asistente');
  header.append(title, close);
  const messages = element('div', 'mp-assistant__messages', undefined, doc); messages.setAttribute('aria-live', 'polite'); messages.setAttribute('aria-relevant', 'additions text');
  const status = element('p', 'mp-assistant__status', undefined, doc); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const form = element('form', 'mp-assistant__form', undefined, doc);
  const textarea = element('textarea', 'mp-assistant__input', undefined, doc); textarea.name = 'message'; textarea.rows = 2; textarea.maxLength = MAX_MESSAGE_LENGTH;
  textarea.placeholder = 'Escribe tu pregunta…'; textarea.setAttribute('aria-label', 'Tu mensaje');
  const send = element('button', 'mp-assistant__send', 'Enviar', doc); send.type = 'submit';
  const count = element('span', 'mp-assistant__count', `0/${MAX_MESSAGE_LENGTH}`, doc);
  form.append(textarea, count, send); panel.append(header, messages, status, form); root.append(opener, panel); doc.body.append(root);
  let currentSession = sessionId();
  const addMessage = (text, role, links = []) => renderAssistantMessage(messages, text, role, links, doc);
  addMessage(welcome, 'assistant');
  const setOpen = (open) => {
    panel.hidden = !open; opener.setAttribute('aria-expanded', String(open));
    if (open) textarea.focus(); else opener.focus();
  };
  opener.addEventListener('click', () => setOpen(true)); close.addEventListener('click', () => setOpen(false));
  doc.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
  textarea.addEventListener('input', () => { count.textContent = `${textarea.value.length}/${MAX_MESSAGE_LENGTH}`; });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let message;
    try { message = validateMessage(textarea.value); }
    catch (error) { status.textContent = error.message; return; }
    addMessage(message, 'user'); textarea.value = ''; count.textContent = `0/${MAX_MESSAGE_LENGTH}`;
    textarea.disabled = true; send.disabled = true; status.textContent = 'Pensando…';
    try {
      const result = await requestAssistantReply(message, currentSession, { path: doc.defaultView.location.pathname, title: doc.title });
      addMessage(result.reply, 'assistant', result.links);
    } catch {
      addMessage(FALLBACK_REPLY, 'assistant', [{ label: 'Buscar en MiPortal', href: new URL('/buscar.html', doc.defaultView.location.origin).href, external: false }]);
    } finally { textarea.disabled = false; send.disabled = false; status.textContent = ''; textarea.focus(); }
  });
  return { root, opener, panel, textarea, messages, close };
}

if (typeof document !== 'undefined') mountAssistant();
