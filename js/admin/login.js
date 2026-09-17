// ============================================================================
// Login del administrador (login.html).
// ============================================================================
(function () {
  const supabase = window.MiPortalSupabase;
  const form = document.getElementById('loginForm');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('submitButton');
  const alertRegion = document.getElementById('loginAlert');
  const errorMessages = document.getElementById('errorMessages');
  const passwordToggle = document.getElementById('togglePassword');

  const params = new URLSearchParams(window.location.search);
  const errorCode = params.get('error');

  const errorTexts = {
    config_pendiente: 'La configuración del panel está pendiente. Completá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Vercel.',
    sesion_expirada: 'Tu sesión expiró. Iniciá sesión nuevamente.',
    no_autorizado: 'Tu usuario no tiene permisos de administrador.'
  };

  // Solo permite redirecciones dentro del mismo sitio (evita open redirects).
  const getSafeNext = () => {
    const raw = params.get('next') || '';
    if (!raw) return './admin/';
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return './admin/';
      return url.pathname + url.search + url.hash;
    } catch {
      return './admin/';
    }
  };

  const next = getSafeNext();

  if (errorCode && errorTexts[errorCode]) {
    alertRegion.textContent = errorTexts[errorCode];
    alertRegion.classList.add('is-visible');
  }

  if (!supabase) {
    alertRegion.textContent = errorTexts.config_pendiente;
    alertRegion.classList.add('is-visible');
    form.querySelectorAll('button, input').forEach((input) => {
      input.disabled = true;
    });
    return;
  }

  // Si ya hay una sesión válida de administrador, ir directo al panel.
  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const profile = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile.error || !profile.data) {
        await supabase.auth.signOut();
        return;
      }

      if (profile.data.role === 'admin') {
        window.location.replace(next);
        return;
      }

      await supabase.auth.signOut();
    } catch {
      // Sin sesión usable; el formulario sigue disponible.
    }
  };

  checkExistingSession();

  const setFieldError = (input, message) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorMessages.id);
      errorMessages.textContent = message;
      errorMessages.classList.add('is-visible');
    } else {
      input.removeAttribute('aria-invalid');
    }
  };

  const setBusy = (busy) => {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Ingresando…' : 'Ingresar';
    form.setAttribute('aria-busy', String(busy));
  };

  const cleanErrors = () => {
    errorMessages.textContent = '';
    errorMessages.classList.remove('is-visible');
    alertRegion.textContent = '';
    alertRegion.classList.remove('is-visible');
    emailInput.removeAttribute('aria-invalid');
    passwordInput.removeAttribute('aria-invalid');
  };

  passwordToggle.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    passwordToggle.textContent = isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    cleanErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      setFieldError(!email ? emailInput : passwordInput, 'Completá el correo y la contraseña.');
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error('Correo o contraseña incorrectos.');
      }

      const profile = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile.error || !profile.data || profile.data.role !== 'admin') {
        await supabase.auth.signOut();
        alertRegion.textContent = 'Este usuario no tiene permisos de administrador.';
        alertRegion.classList.add('is-visible');
        return;
      }

      window.location.replace(next);
    } catch (err) {
      alertRegion.textContent = err.message || 'No se pudo iniciar sesión. Probá nuevamente.';
      alertRegion.classList.add('is-visible');
    } finally {
      setBusy(false);
    }
  });
})();