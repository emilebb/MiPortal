(() => {
  const form = document.getElementById('newsletterForm');
  const status = document.getElementById('newsletterStatus');
  if (!form || !status) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Enviando confirmación…';
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      status.textContent = typeof result?.message === 'string' ? result.message :
        (result?.error || 'No se pudo completar la suscripción.');
      if (response.ok) form.reset();
    } catch { status.textContent = 'No se pudo completar la suscripción. Probá nuevamente.'; }
    finally { button.disabled = false; }
  });
})();