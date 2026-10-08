const NEWSLETTER_SCRIPT = '<script src="js/newsletter.js"></script>';
const ASSISTANT_PAGES = new Set([
  'index.html', 'tutoriales.html', 'tutorial.html', 'productos.html',
  'automatizaciones-n8n.html', 'automatizaciones-gratis.html', 'noticias.html',
  'buscar.html', 'noticia.html', 'recursos.html', 'contacto.html',
  'sobre-nosotros.html', 'politica-de-privacidad.html', 'terminos-y-condiciones.html'
]);

export function injectAssistantAssets(html, file) {
  if (!ASSISTANT_PAGES.has(file)) return html;
  const stylesheet = '<link rel="stylesheet" href="miportal-assistant.css" data-miportal-assistant="style">';
  const bootstrap = '<script type="module" src="js/miportal-assistant.mjs" data-miportal-assistant="bootstrap"></script>';
  if (!html.includes('data-miportal-assistant="style"')) {
    if (!/<\/head>/i.test(html)) throw new Error(`Missing </head> for assistant injection in ${file}`);
    html = html.replace(/<\/head>/i, `${stylesheet}</head>`);
  }
  if (!html.includes('data-miportal-assistant="bootstrap"')) {
    if (!/<\/body>/i.test(html)) throw new Error(`Missing </body> for assistant injection in ${file}`);
    html = html.replace(/<\/body>/i, `${bootstrap}</body>`);
  }
  return html;
}

export function composeNewsletterOutput(html, fallbackSection) {
  const formCount = [...html.matchAll(/id="newsletterForm"/g)].length;
  if (formCount > 1) {
    throw new Error('La fuente n8n contiene más de un formulario de newsletter.');
  }

  let output = formCount === 1
    ? html
    : html.replace('</main>', `${fallbackSection}</main>`);

  output = output.replace(/<script src="js\/newsletter\.js"><\/script>/g, '');
  return output.replace('</body>', `${NEWSLETTER_SCRIPT}</body>`);
}

export function transformTutorialMarkup(html) {
  const headings = [
    'Agrupa el formulario con sentido',
    'Asocia cada control con su etiqueta',
    'Explica los campos y errores',
    'Verifica el recorrido'
  ];
  let output = html;
  for (const [index, heading] of headings.entries()) {
    output = output.replace(`<h2>${index + 1}. ${heading}</h2>`,
      `<h2 id="seccion-${index + 1}">${index + 1}. ${heading}</h2>`);
  }
  return output.replace('<div class="article-content">', '<p><strong>Categoría:</strong> HTML y accesibilidad. <strong>Lectura:</strong> aproximadamente 3 minutos (estimación).</p><nav aria-label="Índice de contenidos"><h2>En esta guía</h2><ol><li><a href="#seccion-1">Agrupar el formulario</a></li><li><a href="#seccion-2">Asociar etiquetas</a></li><li><a href="#seccion-3">Explicar campos y errores</a></li><li><a href="#seccion-4">Verificar el recorrido</a></li></ol></nav><div class="article-content">')
    .replace('<p><a class="btn btn-secondary" href="tutoriales.html">Más tutoriales</a></p>', '<p><a class="btn btn-secondary" href="tutoriales.html">Volver al catálogo</a> <a class="btn btn-primary" href="/#newsletter">Recibir novedades por newsletter</a></p>');
}
