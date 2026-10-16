(() => {
  const status = document.getElementById('proPaymentStatus');
  const button = document.getElementById('checkProStatus');
  if (!status || !button) return;
  const check = async () => {
    button.disabled = true;
    status.textContent = 'Comprobando la activación de tu suscripción…';
    try {
      const client = window.MiPortalSupabase;
      if (!client) throw new Error();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        status.textContent = 'Inicia sesión con la cuenta utilizada para el pago y vuelve a comprobar la activación.';
        return;
      }
      const result = await client.rpc('has_active_pro');
      if (result.error) throw result.error;
      status.textContent = result.data === true
        ? 'Tu suscripción Pro está activa. Los espacios publicitarios de MiPortal se ocultan en tu cuenta.'
        : 'Todavía no consta una suscripción activa. Si acabas de pagar, espera un momento y vuelve a comprobarla. No necesitas pagar otra vez.';
    } catch { status.textContent = 'No pudimos comprobar la activación. Vuelve a intentarlo más tarde.'; }
    finally { button.disabled = false; }
  };
  button.addEventListener('click', check);
  check();
})();
