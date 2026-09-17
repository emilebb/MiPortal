(function () {
  const client = window.MiPortalSupabase;
  const form = document.getElementById('resetForm');
  const password = document.getElementById('password');
  const confirmation = document.getElementById('confirmPassword');
  const button = document.getElementById('submitButton');
  const alert = document.getElementById('resetAlert');
  let recoveryReady = false;
  let busy = false;
  if (!form) return;
  button.disabled = true;
  const invalidLink = 'El enlace no es válido o expiró. Solicitá uno nuevo.';
  alert.textContent = client ? 'Verificando enlace de recuperación…' :
    'La recuperación no está disponible. Falta configurar Supabase.';
  if (!client) return;

  // Una sesión ordinaria no habilita este formulario: esperamos el evento
  // emitido por Supabase al validar el enlace de recuperación de un solo uso.
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      recoveryReady = true;
      button.disabled = false;
      alert.textContent = 'Ingresá y confirmá tu nueva contraseña.';
      window.history.replaceState(null, '', window.location.pathname);
    } else if (event === 'SIGNED_OUT') {
      recoveryReady = false;
      button.disabled = true;
    }
  });
  client.auth.getSession().then(({ data, error }) => {
    if (!error && data.session &&
        window.MiPortalRecoveryUser === data.session.user.id) {
      recoveryReady = true;
      button.disabled = false;
      alert.textContent = 'Ingresá y confirmá tu nueva contraseña.';
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (!recoveryReady) {
      alert.textContent = invalidLink;
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (error) {
      recoveryReady = false;
      button.disabled = true;
      alert.textContent = invalidLink;
    }
  }).catch(() => { alert.textContent = invalidLink; });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!recoveryReady) { alert.textContent = invalidLink; return; }
    password.removeAttribute('aria-invalid');
    confirmation.removeAttribute('aria-invalid');
    const invalid = password.value.length < 6 ? password :
      password.value !== confirmation.value ? confirmation : null;
    if (invalid) {
      alert.textContent = invalid === password ?
        'La contraseña debe tener al menos 6 caracteres.' :
        'Las contraseñas no coinciden.';
      invalid.setAttribute('aria-invalid', 'true');
      invalid.focus();
      return;
    }
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) throw error;
      recoveryReady = false;
      window.MiPortalRecoveryUser = null;
      password.value = confirmation.value = '';
      form.hidden = true;
      alert.textContent = 'Contraseña actualizada. Ya podés iniciar sesión.';
      try {
        const { error: logoutError } = await client.auth.signOut();
        if (logoutError) throw logoutError;
      } catch {
        alert.textContent = 'Contraseña actualizada. No se pudo cerrar la sesión ' +
          'de recuperación; podés cerrarla desde el sitio.';
      }
    } catch {
      alert.textContent = 'No se pudo actualizar la contraseña. Verificá los requisitos ' +
        'e intentá nuevamente; si el enlace expiró, solicitá uno nuevo.';
    } finally {
      busy = false;
      button.disabled = !recoveryReady;
      form.setAttribute('aria-busy', 'false');
    }
  });
})();
