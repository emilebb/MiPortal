// ============================================================================
// Regla única del disparo de novedades al publicar un recurso.
// Misma lógica, un solo lugar: la usa /admin/recurso-form.html y la ejercen
// los tests (Node). Nunca envía cuando solo se edita algo ya publicado, se
// guarda un borrador o se despublica.
// ============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MiPortalPublishDecision = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Debe notificarse SOLO cuando la publicación quedó en true y hubo una
  // transición real: recurso nuevo publicado de entrada, o cambio false → true.
  // isNew:              true si el recurso se acaba de crear.
  // wasPublished:       estado published previo (false en recursos nuevos).
  // willBePublished:    estado published que se acaba de guardar.
  return {
    shouldNotifyNewsletter({ isNew, wasPublished, willBePublished }) {
      return Boolean(willBePublished) && (Boolean(isNew) || Boolean(wasPublished) === false);
    }
  };
});