// ============================================================================
// Cliente Supabase compartido (público + admin).
// Depende de supabase-config.js (generado en build) y del bundle global de
// supabase-js v2 cargado vía CDN en cada página:
//   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// ============================================================================
(function () {
  const config = window.MIPORTAL_SUPABASE;
  const isPlaceholder =
    !config ||
    !config.url ||
    !config.publishableKey ||
    config.url.includes('REEMPLAZAR') ||
    config.publishableKey.includes('REEMPLAZAR');

  if (isPlaceholder || !window.supabase?.createClient) {
    console.warn(
      '[supabase] Configuración pendiente: definí SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY ' +
      'en Vercel (Environment Variables) y redeployá.'
    );
    window.MiPortalSupabase = null;
    return;
  }

  window.MiPortalSupabase = window.supabase.createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  // Captura el evento antes de que termine de descargar el script del formulario.
  // Solo vive en esta página: no convierte una sesión normal en recuperación.
  window.MiPortalRecoveryUser = null;
  window.MiPortalSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      window.MiPortalRecoveryUser = session?.user.id || null;
    } else if (event === 'SIGNED_OUT') {
      window.MiPortalRecoveryUser = null;
    }
  });
})();
