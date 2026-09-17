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

  const renderAdmin = () => {
    const panelLink = document.createElement('a');
    panelLink.href = '/admin/';
    panelLink.className = 'nav-auth';
    panelLink.textContent = 'Panel admin';

    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'nav-auth';
    logoutButton.textContent = 'Cerrar sesión';
    logoutButton.addEventListener('click', async () => {
      try {
        await supabase.auth.signOut();
      } catch {
        // La interfaz se actualiza de todas formas.
      }
      renderLoggedOut();
    });

    authItem.replaceChildren(panelLink, logoutButton);
    bindClick([panelLink, logoutButton]);
  };

  const refresh = async () => {
    if (!supabase) {
      renderLoggedOut();
      return;
    }

    let session;
    try {
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch {
      renderLoggedOut();
      return;
    }

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

      if (error || !profile || profile.role !== 'admin') {
        await supabase.auth.signOut().catch(() => {});
        renderLoggedOut();
        return;
      }

      renderAdmin();
    } catch {
      renderLoggedOut();
    }
  };

  refresh();

  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].includes(event)) {
        refresh();
      }
    });
  }
})();