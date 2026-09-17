// ============================================================================
// Utilidades compartidas del panel /admin.
// Responsabilidades:
//   - Bloquear el acceso: sin sesión o sin rol admin → login.
//   - Helpers de API (listar, publicar/despublicar, eliminar) y UI (toasts).
// NOTA DE SEGURIDAD: esta protección es solo de interfaz. La seguridad real
// la impone Row Level Security en Supabase: los roles y políticas del servidor
// son el control de acceso; el frontend nunca puede saltárselo.
// ============================================================================
(function () {
  const supabase = window.MiPortalSupabase;

  const getNextPath = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('next') || './';
  };

  const redirectToLogin = (errorCode) => {
    const params = new URLSearchParams();
    if (errorCode) params.set('error', errorCode);
    params.set('next', window.location.pathname + window.location.search);
    window.location.replace(`../login.html?${params.toString()}`);
  };

  // Guard que deben ejecutar TODAS las páginas /admin.
  // Devuelve el cliente supabase listo, o null si redirige a login.
  async function requireAdmin() {
    if (!supabase) {
      redirectToLogin('config_pendiente');
      return null;
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        redirectToLogin('sesion_expirada');
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error || !data) {
        redirectToLogin('perfil_no_disponible');
        return null;
      }
      if (data.role !== 'admin') {
        redirectToLogin('no_autorizado');
        return null;
      }

      return supabase;
    } catch {
      redirectToLogin('sesion_expirada');
      return null;
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.replace('../login.html');
    } catch {
      let region = document.getElementById('logoutAlert');
      if (!region) {
        region = document.createElement('p');
        region.id = 'logoutAlert';
        region.setAttribute('role', 'alert');
        document.querySelector('.admin-header').append(region);
      }
      region.textContent = 'No se pudo cerrar sesión. Probá nuevamente.';
    }
  }

  // Toast accesible (role=status) dentro de la zona indicada.
  function showToast(message, type = 'info', region) {
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    region.replaceChildren(toast);
    window.setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 6000);
  }

  const ResourceAPI = {
    async listAll() {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },

    async setPublished(id, published) {
      const { error } = await supabase
        .from('resources')
        .update({ published })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },

    async remove(id) {
      const { error } = await supabase.from('resources').delete().eq('id', id);
      if (error) throw new Error(error.message);
    }
  };

  window.Admin = {
    supabase,
    requireAdmin,
    signOut,
    showToast,
    ResourceAPI
  };

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => signOut());
  }
})();
