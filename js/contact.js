(() => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  const status = document.getElementById('contactStatus');
  const button = form.querySelector('button[type="submit"]');
  let sending = false;
  let attempt;
  const snapshot = () => JSON.stringify(Object.fromEntries(new FormData(form)));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    sending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Enviando…';
    try {
      const content = snapshot();
      // Conserva la clave tras errores; no reintenta automáticamente.
      if (!attempt || attempt.content !== content) {
        attempt = { content, requestId: crypto.randomUUID(), createdAt: Date.now() };
      }
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...JSON.parse(content),
          requestId: attempt.requestId, createdAt: attempt.createdAt }),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok) {
        status.textContent = typeof result?.error === 'string'
          ? result.error : 'No se pudo confirmar el envío. Inténtalo más tarde.';
        return;
      }
      if (response.status !== 202 || typeof result?.message !== 'string') {
        throw new Error('Unexpected response');
      }
      status.textContent = result.message;
      // No borra ediciones que se hayan hecho mientras esperaba la respuesta.
      if (snapshot() === content) form.reset();
      attempt = undefined;
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'La solicitud tardó demasiado. Reintenta sin cambiar el mensaje.'
        : 'No pudimos confirmar el envío. Reintenta sin cambiar el mensaje.';
    } finally {
      sending = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
