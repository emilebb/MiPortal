import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../public/', import.meta.url));

test('el build genera una navegación y un pie compartidos en todo HTML público', () => {
  execFileSync(process.execPath, ['scripts/build-static.mjs'], { cwd: root });
  const pages = readdirSync(output).filter((file) => file.endsWith('.html'));
  assert.ok(pages.length > 0, 'el build debe producir páginas HTML');

  for (const page of pages) {
    const html = readFileSync(new URL(page, `file://${output}`), 'utf8');
    assert.match(html, /id="mainNav"/, `${page}: navbar`);
    assert.match(html, /id="navToggle"/, `${page}: control móvil`);
    assert.match(html, /id="themeToggle"/, `${page}: tema`);
    assert.match(html, /id="auth-nav-item"/, `${page}: navegación de cuenta`);
    assert.match(html, /class="main-footer"/, `${page}: footer`);
    const nav = html.match(/<nav class="main-nav" id="mainNav"[\s\S]*?<\/nav>/)?.[0] || '';
    const activeLinks = [...nav.matchAll(/<a\b(?=[^>]*\bclass="[^"]*\bactive\b")(?=[^>]*\baria-current="page")[^>]*href="([^"]+)"[^>]*>/g)];
    const expectedRoute = ({
      'index.html': '/',
      'noticia.html': '/noticias.html',
      'tutorial.html': '/tutoriales.html'
    })[page] || `/${page}`;
    const routeLinks = [...nav.matchAll(new RegExp(`<a\\b(?=[^>]*\\bhref="${expectedRoute.replaceAll('.', '\\.')}"[^>]*)[^>]*>`, 'g'))];
    assert.equal(activeLinks.length, routeLinks.length ? 1 : 0, `${page}: one active link only when the route is in primary navigation`);
    if (activeLinks.length) assert.equal(activeLinks[0][1], expectedRoute, `${page}: current route`);
    for (const route of ['noticias.html', 'tutoriales.html', 'recursos.html', 'buscar.html', 'productos.html', 'contacto.html']) {
      assert.match(html, new RegExp(`href="/?${route}"`), `${page}: enlace a ${route}`);
    }
    assert.match(html, /aria-label="Explorar"[\s\S]*?Inicio[\s\S]*?Noticias[\s\S]*?Tutoriales[\s\S]*?Recursos[\s\S]*?Productos/);
    assert.match(html, /aria-label="Información"[\s\S]*?Sobre nosotros[\s\S]*?Contacto[\s\S]*?Privacidad[\s\S]*?Términos/);
  }
  const detail = readFileSync(new URL('noticia.html', `file://${output}`), 'utf8');
  assert.match(detail, /js\/news-detail\.mjs/);
  assert.match(detail, /id="newsArticle"/);
});

test('la búsqueda global se incluye en el sitio y se marca para no indexación', () => {
  const html = readFileSync(new URL('buscar.html', `file://${output}`), 'utf8');
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.match(html, /id="globalSearchForm"/);
  assert.match(html, /js\/global-search\.mjs/);
  assert.match(html, /href="\/buscar\.html"[^>]*>Buscar<\/a>/);
});

test('el lead magnet conserva el contrato del newsletter y declara que el recurso está pendiente', () => {
  const html = readFileSync(new URL('automatizaciones-n8n.html', `file://${output}`), 'utf8');
  assert.match(html, /5 automatizaciones de n8n que puedes usar gratis/);
  assert.match(html, /Próximamente/);
  assert.match(html, /id="newsletterForm"[^>]*action="\/api\/newsletter"/);
  assert.match(html, /name="website"/);
  assert.match(html, /id="newsletterStatus"/);
  assert.match(html, /js\/newsletter\.js/);
  assert.doesNotMatch(html, /Descargar recurso gratis|Descarga ahora/i);
});

test('el catálogo de tutoriales informa el contenido disponible y enlaza al newsletter', () => {
  const html = readFileSync(new URL('tutoriales.html', `file://${output}`), 'utf8');
  assert.match(html, /n8n, JavaScript, React, Next\.js, Docker, Supabase/);
  assert.match(html, /solo está publicado el tutorial/);
  assert.match(html, /#newsletter/);
});

test('el Home concreta la propuesta y lleva a tutoriales y noticias', () => {
  const html = readFileSync(new URL('index.html', `file://${output}`), 'utf8');
  assert.match(html, /Aprende desarrollo web, IA y automatización construyendo proyectos reales/);
  assert.match(html, /Tutoriales paso a paso, herramientas y recursos en español/);
  assert.match(html, />Empezar a aprender<\/a>/);
  assert.match(html, />Explorar noticias<\/a>/);
  assert.match(html, /id="newsletterForm"[^>]*action="\/api\/newsletter"/);
});
