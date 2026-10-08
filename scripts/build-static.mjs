// ============================================================================
// Copia el sitio estático final a public/ para Vercel, que sirve esa carpeta
// como Output Directory. Se usa una allowlist: solo lo que el portal necesita
// en producción. Nada de scripts/, supabase/, docs ni variables.
// ============================================================================
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { composeNewsletterOutput, injectAssistantAssets, transformTutorialMarkup } from './static-build-utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../public/', import.meta.url));

const entries = [
  'index.html',
  'tutoriales.html',
  'tutorial.html',
  'productos.html',
  'automatizaciones-n8n.html',
  'automatizaciones-gratis.html',
  'noticias.html',
  'buscar.html',
  'noticia.html',
  'recursos.html',
  'contacto.html',
  'sobre-nosotros.html',
  'politica-de-privacidad.html',
  'terminos-y-condiciones.html',
  'login.html',
  'register.html',
  'recovery.html',
  'reset-password.html',
  'gracias-pro.html',
  'styles.css',
  'miportal-assistant.css',
  'main.js',
  'robots.txt',
  'sitemap.xml',
  'og-image.svg',
  'favicon.svg',
  'apple-touch-icon.svg',
  'supabase-config.js',
  'js',
  'admin'
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  cpSync(root + entry, outDir + entry, { recursive: true });
}

const sharedHeader = `<header class="main-header"><div class="header-inner"><div class="logo"><a class="logo-link" href="/" aria-label="MiPortal — Inicio"><span class="logo-mark">MP</span><span class="logo-text">MiPortal<span>.me</span></span></a></div><nav class="main-nav" id="mainNav" aria-label="Navegación principal"><ul><li><a href="/">Inicio</a></li><li><a href="/noticias.html">Noticias</a></li><li><a href="/tutoriales.html">Tutoriales</a></li><li><a href="/recursos.html">Recursos</a></li><li><a href="/buscar.html">Buscar</a></li><li><a href="/productos.html">Productos</a></li><li><a href="/contacto.html">Contacto</a></li><li class="auth-nav" id="auth-nav-item"><a class="nav-login" href="/login.html">Iniciar sesión</a><a class="nav-register" href="/register.html">Registrarse</a></li></ul></nav><button id="themeToggle" class="btn-theme" type="button" aria-label="Cambiar a modo oscuro" aria-pressed="false">◐</button><button class="nav-toggle" id="navToggle" type="button" aria-label="Abrir menú de navegación" aria-expanded="false" aria-controls="mainNav"><span class="nav-toggle-icon" aria-hidden="true"><span class="nav-toggle-line"></span><span class="nav-toggle-line"></span><span class="nav-toggle-line"></span></span></button></div></header>`;
const sharedFooter = `<footer class="main-footer"><div class="footer-inner"><div class="footer-brand"><span class="logo-text footer-brand-name">MiPortal<span>.me</span></span><p class="footer-tagline">Noticias, guías y recursos de tecnología en español.</p></div><nav class="footer-nav" aria-label="Explorar"><span class="footer-title">Explorar</span><a href="/">Inicio</a><a href="/noticias.html">Noticias</a><a href="/tutoriales.html">Tutoriales</a><a href="/recursos.html">Recursos</a><a href="/productos.html">Productos</a></nav><nav class="footer-nav" aria-label="Información"><span class="footer-title">Información</span><a href="/sobre-nosotros.html">Sobre nosotros</a><a href="/contacto.html">Contacto</a><a href="/politica-de-privacidad.html">Privacidad</a><a href="/terminos-y-condiciones.html">Términos</a></nav><a class="footer-newsletter-link" href="/#newsletter">Newsletter</a></div><p class="footer-copy">&copy; 2026 MiPortal. Todos los derechos reservados.</p></footer>`;

const activeRouteOverrides = {
  'index.html': '/',
  'noticia.html': '/noticias.html',
  'tutorial.html': '/tutoriales.html'
};

for (const file of readdirSync(outDir).filter((name) => name.endsWith('.html'))) {
  const path = outDir + file;
  let html = readFileSync(path, 'utf8');
  const activeRoute = activeRouteOverrides[file] || `/${file}`;
  const pageHeader = sharedHeader.replace(
    /<nav class="main-nav" id="mainNav"[\s\S]*?<\/nav>/,
    (navigation) => {
      const routePattern = new RegExp(`<a\\b(?=[^>]*\\bhref="${activeRoute.replaceAll('.', '\\.')}\")[^>]*>`);
      const matches = [...navigation.matchAll(new RegExp(routePattern.source, 'g'))];
      if (!matches.length) return navigation;
      if (matches.length !== 1) throw new Error(`La ruta activa no es única para ${file}`);
      return navigation.replace(routePattern, (openingTag) => {
        if (openingTag.includes('aria-current=')) return openingTag;
        if (/\bclass="[^"]*"/.test(openingTag)) {
          return openingTag.replace(/\bclass="([^"]*)"/, 'class="$1 active"')
            .replace(/>$/, ' aria-current="page">');
        }
        return openingTag.replace(/>$/, ' class="active" aria-current="page">');
      });
    }
  );
  html = html.replace(/<header class="main-header">[\s\S]*?<\/header>/i, '')
    .replace(/<header class="admin-header">[\s\S]*?<\/header>/i, '')
    .replace(/<footer class="main-footer">[\s\S]*?<\/footer>/i, '')
    .replace(/(<body\b[^>]*>\s*(?:<a class="skip-link"[^>]*>[\s\S]*?<\/a>)?)/i, `$1${pageHeader}`)
    .replace(/(<\/main>)/i, `$1${sharedFooter}`);
  if (!html.includes('id="themeToggle"')) throw new Error(`No se pudo componer la navegación para ${file}`);
  if (!/<script src="(?:\.\/)?main\.js"><\/script>/.test(html)) {
    html = html.replace(/<\/body>/i, '<script src="main.js"></script></body>');
  }
  if (file === 'index.html') {
    html = html.replace('<title>MiPortal | Desarrollo web y automatización en español</title>', '<title>MiPortal | Desarrollo web, IA y automatización en español</title>')
      .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Tutoriales paso a paso, herramientas y recursos en español para aprender desarrollo web, inteligencia artificial y automatización creando proyectos.">')
      .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="MiPortal | Desarrollo web, IA y automatización en español">')
      .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Tutoriales paso a paso, herramientas y recursos en español para aprender desarrollo web, inteligencia artificial y automatización creando proyectos.">')
      .replace(/<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="MiPortal | Desarrollo web, IA y automatización en español">')
      .replace(/<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="Tutoriales paso a paso, herramientas y recursos en español para aprender desarrollo web, inteligencia artificial y automatización creando proyectos.">')
      .replace(/<h1 class="hero-title">[\s\S]*?<\/h1>/, '<h1 class="hero-title">Aprende desarrollo web, IA y automatización construyendo proyectos reales</h1>')
      .replace(/<p class="hero-lead">[\s\S]*?<\/p>/, '<p class="hero-lead">Tutoriales paso a paso, herramientas y recursos en español para pasar de aprender a crear.</p>')
      .replace('>Explorar tutoriales</a>', '>Empezar a aprender</a>')
      .replace('>Leer noticias</a>', '>Explorar noticias</a>');
  }
  if (file === 'automatizaciones-n8n.html') {
    html = html.replace('<h1>Automatizaciones con n8n</h1>', '<h1>5 automatizaciones de n8n que puedes usar gratis</h1>')
      .replace(/<p class="news-hero-lead">Una introducción[\s\S]*?<\/p>/, '<p class="news-hero-lead">Cinco ideas en preparación para explorar automatizaciones útiles. No hay un archivo ni una descarga disponible por ahora.</p>')
      .replace(/<section class="home-section">\s*<div class="article-content">[\s\S]*?<\/section>/, '<section class="home-section"><div class="article-content"><h2>Ideas de automatización</h2><ul><li>Recopilar noticias y novedades en un resumen.</li><li>Preparar borradores para un newsletter.</li><li>Apoyar tareas con herramientas de IA.</li><li>Automatizar tareas repetitivas entre servicios.</li><li>Organizar avisos, tareas y seguimiento.</li></ul><p><strong>Próximamente.</strong> Son categorías propuestas, no flujos publicados o garantizados.</p></div></section>');
    html = composeNewsletterOutput(html, '<section class="newsletter-band" id="newsletter" aria-labelledby="newsletter-title"><div><span class="eyebrow">Newsletter · Próximamente</span><h2 id="newsletter-title">Recibe novedades de MiPortal</h2><p>Suscríbete al newsletter general. No hay una descarga disponible ni una entrega específica garantizada para este recurso.</p></div><form id="newsletterForm" class="newsletter-form" action="/api/newsletter" method="post"><label for="newsletterEmail">Correo electrónico<input id="newsletterEmail" name="email" type="email" autocomplete="email" placeholder="tu@email.com" required></label><label class="visually-hidden" aria-hidden="true">Sitio web<input name="website" tabindex="-1" autocomplete="off"></label><button type="submit" class="btn btn-primary">Suscribirme</button><p id="newsletterStatus" class="newsletter-status" role="status" aria-live="polite"></p><p class="newsletter-privacy-note">Al suscribirte, recibirás el correo habitual de confirmación. Consulta nuestra <a href="/politica-de-privacidad.html">política de privacidad</a>.</p></form></section>');
  }
  if (file === 'automatizaciones-gratis.html') {
    html = html.replace('<title>Automatizaciones de n8n | MiPortal</title>', '<title>Automatizaciones con n8n | MiPortal</title>')
      .replace('https://www.miportal.me/automatizaciones-gratis.html', 'https://www.miportal.me/automatizaciones-n8n.html')
      .replace('<meta property="og:url" content="https://www.miportal.me/automatizaciones-gratis.html">', '<meta property="og:url" content="https://www.miportal.me/automatizaciones-n8n.html">')
      .replace(/<main id="main-content"[\s\S]*?<\/main>/, '<main id="main-content" class="container home-page"><section class="news-hero"><span class="eyebrow">Página actualizada</span><h1>Automatizaciones con n8n</h1><p class="news-hero-lead">Consulta la página principal del proyecto para conocer las ideas en preparación.</p><a class="btn btn-primary" href="/automatizaciones-n8n.html">Ir a la página principal</a></section></main>');
  }
  if (file === 'noticias.html') {
    html = html.replace('MiPortal reúne contenido de fuentes especializadas en desarrollo web. Las noticias se recopilan automáticamente y se guardan en nuestra base de datos antes de mostrarse aquí, así que la lista no depende de una consulta directa a cada editorial.', 'Reunimos noticias de fuentes especializadas en desarrollo web.')
      .replace('Cada noticia conserva el nombre de su fuente y enlaza directamente al artículo original. Puedes filtrar por tema e idioma, y abrir la fuente oficial para leer el texto completo.', 'Cada noticia identifica y enlaza su fuente original. Puedes filtrar por tema e idioma y consultar el artículo completo en el sitio de origen.');
  }
  if (file === 'tutoriales.html') {
    html = html.replace(/<section class="home-section"><div class="cards-grid([^\"]*)">/, '<section class="home-section"><h2>Intereses y categorías</h2><p>Temas previstos: n8n, JavaScript, React, Next.js, Docker, Supabase, inteligencia artificial y automatización. Actualmente solo está publicado el tutorial de formularios HTML accesibles.</p><div class="cards-grid$1">')
      .replace('</main>', '<section class="newsletter-band" id="newsletter"><div><span class="eyebrow">Aprende con MiPortal</span><h2>Recibe tutoriales, herramientas y automatizaciones en tu correo.</h2><p>Novedades del portal por medio del newsletter existente.</p></div><a class="btn btn-primary" href="/#newsletter">Suscribirme gratis</a></section></main>');
  }
  if (file === 'tutorial.html') {
    html = transformTutorialMarkup(html);
  }
  if (file === 'productos.html') {
    html = html.replace('</main>', '<section class="home-section"><article class="card"><div class="card-body"><span class="tag">No disponible · En preparación</span><h2>MiPortal Automation Pack #1</h2><p class="card-description">Concepto de pack futuro: propuestas de automatización para noticias, newsletter, tareas con IA, procesos repetitivos y organización. Contenido y disponibilidad aún por definir; no está a la venta.</p><a class="btn btn-primary" href="/#newsletter">Enterarme de novedades</a></div></article></section></main>');
  }
  html = injectAssistantAssets(html, file);
  writeFileSync(path, html);
}

console.log(`[build] Sitio estático copiado a public/ (${entries.length} entradas).`);
