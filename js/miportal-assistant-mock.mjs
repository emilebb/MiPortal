// Local-only demonstration replies. The API client does not make network calls in mock mode.
export function createMockResponse(message) {
  const normalized = message.trim().toLocaleLowerCase('es');
  const knownAnswers = [
    { match: /^(¿?qué es miportal\??|que es miportal\??)$/, reply: 'MiPortal reúne noticias, tutoriales y recursos de tecnología en español.', label: 'Explorar MiPortal', url: '/' },
    { match: /noticias/, reply: 'Puedes consultar las noticias publicadas en MiPortal.', label: 'Ver noticias', url: '/noticias.html' },
    { match: /tutoriales/, reply: 'En MiPortal encontrarás guías y tutoriales disponibles.', label: 'Ver tutoriales', url: '/tutoriales.html' },
    { match: /recursos/, reply: 'Consulta los recursos publicados para seguir aprendiendo.', label: 'Ver recursos', url: '/recursos.html' },
    { match: /buscar|búsqueda|busqueda/, reply: 'Puedes buscar noticias y contenido del portal desde la búsqueda.', label: 'Buscar en MiPortal', url: '/buscar.html' }
  ];
  const answer = knownAnswers.find(({ match }) => match.test(normalized));
  if (answer) return { reply: answer.reply, links: [{ label: answer.label, url: answer.url }] };
  return { reply: `Gracias por tu pregunta: «${message}». Puedes explorar las secciones de MiPortal o usar la búsqueda.`, links: [{ label: 'Buscar en MiPortal', url: '/buscar.html' }] };
}
