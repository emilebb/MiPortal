(function () {
  const supabase = window.MiPortalSupabase;
  const form = document.getElementById('registerForm');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const submitButton = document.getElementById('submitButton');
  const alertRegion = document.getElementById('registerAlert');
  const errorMessages = document.getElementById('errorMessages');

  if (!supabase) {
    alertRegion.textContent = 'La configuración del registro está pendiente. Completá SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en Vercel.';
    alertRegion.classList.add('is-visible');
    form.querySelectorAll('button, input').forEach((input) => {
      input.disabled = true;
    });
    return;
  }

  document.querySelectorAll('.toggle-password').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const target = document.getElementById(toggle.dataset.for);
      if (!target) return;
      const isHidden = target.type === 'password';
      target.type = isHidden ? 'text' : 'password';
      toggle.textContent = isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña';
    });
  });

  const setFieldError = (input, message) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorMessages.id);
      errorMessages.textContent = message;
      errorMessages.classList.add('is-visible');
      input.focus();
    } else {
      input.removeAttribute('aria-invalid');
    }
  };

  const cleanErrors = () => {
    errorMessages.textContent = '';
    errorMessages.classList.remove('is-visible');
    alertRegion.textContent = '';
    alertRegion.classList.remove('is-visible');
    emailInput.removeAttribute('aria-invalid');
    passwordInput.removeAttribute('aria-invalid');
    confirmInput.removeAttribute('aria-invalid');
  };

  const setBusy = (busy) => {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Creando cuenta…' : 'Crear cuenta';
    form.setAttribute('aria-busy', String(busy));
  };

  const fail = (message) => {
    alertRegion.textContent = message;
    alertRegion.classList.add('is-visible');
    setBusy(false);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    cleanErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmation = confirmInput.value;

    if (!email || !password || !confirmation) {
      setFieldError(!email ? emailInput : !password ? passwordInput : confirmInput, 'Completá todos los campos.');
      return;
    }

    if (password.length < 6) {
      setFieldError(passwordInput, 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmation) {
      setFieldError(confirmInput, 'Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + '/login.html' }
      });

      if (error) {
        throw new Error(error.message === 'User already registered' ? 'Este correo ya está registrado.' : error.message);
      }

      if (data.session) {
        await supabase.auth.signOut().catch(() => {});
        window.location.replace('login.html?registered=1');
        return;
      }

      alertRegion.textContent = 'Revisá tu bandeja de entrada para confirmar tu correo y luego iniciá sesión.';
      alertRegion.classList.add('is-visible');
      form.hidden = true;
    } catch (err) {
      fail(err.message || 'No se pudo crear la cuenta. Probá nuevamente.');
    }
  });
})();