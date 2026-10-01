/* ============================================================================
   MiPortal — arranque del tema (se carga de forma síncrona en <head>)
   ----------------------------------------------------------------------------
   Hace dos cosas antes del primer pintado, para evitar el destello de tema
   claro en usuarios que eligieron el oscuro:

     1. Marca <html class="js">. Sirve para que las animaciones de entrada
        (.reveal) solo se apliquen cuando hay JavaScript: si no lo hubiera,
        el contenido quedaría invisible para siempre.
     2. Aplica el tema guardado en localStorage mediante data-theme.

   La preferencia se escribe en main.js (misma clave) al pulsar el toggle.
   Si el usuario nunca eligió, se respeta la preferencia del sistema
   mediante prefers-color-scheme.
   ========================================================================== */
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  var stored = null;

  try {
    stored = window.localStorage.getItem('miportal-theme');
  } catch (error) {
    // Modo privado o almacenamiento bloqueado: seguimos con la preferencia
    // del sistema, que no necesita persistencia.
    stored = null;
  }

  var prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  root.setAttribute('data-theme', stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light');
})();
