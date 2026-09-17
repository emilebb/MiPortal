// ============================================================================
// Login compartido de viewers y administradores (login.html).
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
  const registered = params.get('registered');

  const errorTexts = {
    config_pendiente: 'La configuración del panel está pendiente. Completá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Vercel.',
    sesion_expirada: 'Tu sesión expiró. Iniciá sesión nuevamente.',
    no_autorizado: 'Tu usuario no tiene permisos de administrador. Podés volver al sitio con tu sesión activa.',
    perfil_no_disponible: 'No se pudieron verificar tus permisos. Probá nuevamente.'
  };

  if (registered === '1') {
    alertRegion.textContent = 'Cuenta creada correctamente. Ahora iniciá sesión.';
    alertRegion.classList.add('is-visible');
  }

  // Solo permite redirecciones dentro del mismo sitio (evita open redirects).
  const getSafeNext = (role) => {
    const fallback = role === 'admin' ? '/admin/' : '/index.html';
    const raw = params.get('next') || '';
    if (!raw) return fallback;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return fallback;
      const path = decodeURIComponent(url.pathname).toLowerCase();
      if (path.includes('\\') || path.includes('%')) return fallback;
      if (role !== 'admin' && /^\/admin(?:\/|$)/.test(path)) return fallback;
      if (/^\/(login|register|recovery|reset-password)\.html$/.test(path)) {
        return fallback;
      }
      return url.pathname + url.search + url.hash;
    } catch {
      return fallback;
    }
  };

  const redirectSession = async (session, preserveDenial = false) => {
    const { data, error } = await supabase.from('profiles').select('role')
      .eq('id', session.user.id).maybeSingle();
    if (error || !data || !['admin', 'viewer'].includes(data.role)) {
      throw new Error(errorTexts.perfil_no_disponible);
    }
    // Conserva visible la explicación de un acceso denegado por el guard.
    if (preserveDenial && errorCode === 'no_autorizado' && data.role !== 'admin') {
      return;
    }
    window.location.replace(getSafeNext(data.role));
  };

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

  // Un fallo de permisos nunca debe cerrar una sesión válida.
  const checkExistingSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw new Error('No se pudo consultar tu sesión. Probá nuevamente.');
      if (!session) return;
      await redirectSession(session, true);
    } catch (err) {
      alertRegion.textContent = err.message;
      alertRegion.classList.add('is-visible');
    }
  };

  checkExistingSession();

  const setFieldError = (input, message) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorMessages.id);
      errorMessages.textContent = message;
      errorMessages.hidden = false;
      errorMessages.classList.add('is-visible');
      input.focus();
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
    errorMessages.hidden = true;
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
    passwordToggle.setAttribute('aria-label', passwordToggle.textContent);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    cleanErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      setFieldError(!email ? emailInput : passwordInput, 'Completá el correo y la contraseña.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(emailInput, 'Ingresá un correo electrónico válido.');
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error('Correo o contraseña incorrectos.');
      }

      await redirectSession(data);
    } catch (err) {
      alertRegion.textContent = err.message || 'No se pudo iniciar sesión. Probá nuevamente.';
      alertRegion.classList.add('is-visible');
    } finally {
      setBusy(false);
    }
  });
})();
