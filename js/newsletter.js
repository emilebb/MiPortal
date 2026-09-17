(() => {
  const form = document.getElementById('newsletterForm');
  const status = document.getElementById('newsletterStatus');
  if (!form || !status) return;
  const button = form.querySelector('button[type="submit"]');
  let sending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    sending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Suscribiendo…';
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        status.textContent = typeof result?.message === 'string'
          ? result.message : '¡Gracias! Te has suscrito correctamente.';
        form.reset();
        return;
      }
      status.textContent = typeof result?.error === 'string'
        ? result.error : 'No se pudo completar la suscripción. Probá nuevamente.';
    } catch {
      status.textContent = 'No se pudo completar la suscripción. Probá nuevamente.';
    } finally {
      sending = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();