(function () {
  const supabase = window.MiPortalSupabase;
  const authItem = document.getElementById('auth-nav-item');
  if (!authItem) return;

  const mainNav = document.getElementById('mainNav');
  const navToggle = document.getElementById('navToggle');

  const closeMenu = () => {
    if (!mainNav || !mainNav.classList.contains('open')) return;
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menú de navegación');
  };

  const bindClick = (elements) => {
    elements.forEach((element) => element.addEventListener('click', closeMenu));
  };

  const renderLoggedOut = () => {
    const loginLink = document.createElement('a');
    loginLink.href = '/login.html';
    loginLink.textContent = 'Iniciar sesión';

    const registerLink = document.createElement('a');
    registerLink.href = '/register.html';
    registerLink.textContent = 'Registrarse';

    authItem.replaceChildren(loginLink, registerLink);
    bindClick([loginLink, registerLink]);
  };

  const renderAuthenticated = (isAdmin, message = '') => {
    const panelLink = document.createElement('a');
    panelLink.href = '/admin/';
    panelLink.className = 'nav-auth';
    panelLink.textContent = 'Panel admin';

    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'nav-auth';
    logoutButton.textContent = 'Cerrar sesión';
    const alert = document.createElement('span');
    alert.setAttribute('role', 'alert');
    alert.textContent = message;
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        renderLoggedOut();
      } catch {
        alert.textContent = 'No se pudo cerrar sesión. Probá nuevamente.';
        logoutButton.disabled = false;
      }
    });

    authItem.replaceChildren(...(isAdmin ? [panelLink] : []), logoutButton, alert);
    bindClick([panelLink, logoutButton]);
  };

  let revision = 0;
  const refresh = async () => {
    const current = ++revision;
    if (!supabase) {
      renderLoggedOut();
      return;
    }

    let session;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      session = data.session;
    } catch {
      if (current !== revision) return;
      renderLoggedOut();
      const alert = document.createElement('span');
      alert.setAttribute('role', 'alert');
      alert.textContent = 'No se pudo consultar tu sesión. Recargá para reintentar.';
      authItem.replaceChildren(...authItem.children, alert);
      return;
    }

    if (current !== revision) return;
    if (!session) {
      renderLoggedOut();
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (current !== revision) return;
      renderAuthenticated(!error && profile?.role === 'admin',
        error || !profile ? 'No se pudieron verificar tus permisos. Recargá para reintentar.' : '');
    } catch {
      if (current !== revision) return;
      renderAuthenticated(false, 'No se pudieron verificar tus permisos. Recargá para reintentar.');
    }
  };

  refresh();

  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
        // No ejecutar consultas Supabase dentro del callback de Auth (lock).
        ++revision;
        window.setTimeout(refresh, 0);
      }
    });
  }
})();
