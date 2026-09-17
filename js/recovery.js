(function () {
  const client = window.MiPortalSupabase;
  const form = document.getElementById('recoveryForm');
  const email = document.getElementById('email');
  const button = document.getElementById('submitButton');
  const alert = document.getElementById('recoveryAlert');
  if (!form) return;
  if (!client) {
    alert.textContent = 'La recuperación no está disponible. Falta configurar Supabase.';
    button.disabled = true;
    return;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    email.removeAttribute('aria-invalid');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      email.setAttribute('aria-invalid', 'true');
      alert.textContent = 'Ingresá un correo electrónico válido.';
      email.focus();
      return;
    }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    alert.textContent = '';
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.value.trim(), {
        redirectTo: window.location.origin + '/reset-password.html'
      });
      if (error) throw error;
      alert.textContent = 'Si el correo tiene una cuenta, recibirás un enlace para ' +
        'restablecer tu contraseña. Revisá también la carpeta de spam.';
    } catch {
      alert.textContent = 'No se pudo enviar el enlace. Esperá unos minutos y reintentá.';
    } finally {
      button.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  });
})();
