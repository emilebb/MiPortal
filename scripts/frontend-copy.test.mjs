import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Pro copy matches the configured annual Mercado Pago plan and account behavior', () => {
  const html = read('index.html');
  const checkout = read('api/mp-preference.js');
  const behavior = read('main.js');
  assert.match(checkout, /planTitle = 'MiPortal Pro — suscripción anual'/);
  assert.match(checkout, /planPrice = 19999/);
  assert.match(checkout, /planCurrency = 'COP'/);
  assert.match(html, /Suscripción anual de COP 19\.999 mediante Mercado Pago/);
  assert.match(behavior, /ad\.hidden = !isPro/);
});

test('legal pages identify themselves as incomplete drafts and avoid technical placeholder labels', () => {
  for (const path of ['politica-de-privacidad.html', 'terminos-y-condiciones.html']) {
    const html = read(path);
    assert.match(html, /borrador incompleto/i);
    assert.doesNotMatch(html, /Pendiente de completar/);
    assert.match(html, /pendiente de confirmar por el titular/i);
  }
});

test('n8n newsletter form is inserted once by the static source transform', () => {
  const source = read('automatizaciones-n8n.html');
  const build = read('scripts/build-static.mjs');
  assert.equal([...source.matchAll(/id="newsletterForm"/g)].length, 1);
  assert.match(build, /composeNewsletterOutput\(html,/);
  assert.match(build, /replace\(\/<section class="home-section">\\s\*<div class="article-content">/);
  assert.doesNotMatch(build, /replaceAll\('Recibí novedades de MiPortal'/);
});

test('cookie notice supports keyboard dismissal and returns focus without saving a choice', () => {
  const script = read('main.js');
  assert.match(script, /notice\.querySelector\('\.cookie-reject'\)\.focus\(\)/);
  assert.match(script, /notice\.querySelector\('\.cookie-close'\)\.addEventListener\('click', dismissNotice\)/);
  assert.match(script, /event\.key !== 'Escape'/);
  assert.match(script, /notice\.remove\(\);\s*if \(returnFocus\?\.isConnected/);
  const escapeHandler = script.slice(script.indexOf("notice.addEventListener('keydown'"),
    script.indexOf('const setupCookiePreferences'));
  assert.doesNotMatch(escapeHandler, /localStorage|cookieConsentKey/);
});

test('account registration copy describes email confirmation and uses neutral tuteo', () => {
  const registration = read('js/register.js');
  const navigation = read('js/auth-nav.js');
  assert.match(registration, /Revisa tu bandeja de entrada para confirmar tu correo y luego inicia sesión/);
  assert.match(navigation, /No se pudo cerrar sesión\. Vuelve a intentarlo/);
  assert.doesNotMatch(navigation, /Probá|Recargá/);
});

test('login accepts ordinary accounts and reserves only the admin panel for administrators', () => {
  const login = read('login.html');
  const registration = read('register.html');
  const loginFlow = read('js/admin/login.js');
  const schema = read('supabase/schema.sql');
  assert.match(login, /Inicia sesión con tu cuenta de MiPortal/);
  assert.match(login, /solo el rol admin puede abrir el panel de administración/);
  assert.match(registration, /El registro crea una cuenta viewer/);
  assert.match(loginFlow, /\['admin', 'viewer', 'pro'\]/);
  assert.match(schema, /role\s+text not null default 'viewer'/);
});

test('public homepage and tutorial build copy uses neutral tuteo for authored prompts', () => {
  const home = read('index.html');
  const tutorial = read('tutorial.html');
  const build = read('scripts/build-static.mjs');
  assert.match(home, /Recibe noticias, tutoriales y recursos/);
  assert.doesNotMatch(tutorial, /Agrupá|Asociá|Explicá|Verificá|Usá|evitá|Elegí|agregá|Completá|Comprobá|Probá|Confirmá/);
  assert.match(build, /transformTutorialMarkup\(html\)/);
  assert.ok(build.includes('/<section class="home-section">\\s*<div class="article-content">'));
});

test('tutorial build transform preserves anchors and emits neutral-tuteo copy', async () => {
  const { transformTutorialMarkup } = await import('../scripts/static-build-utils.mjs');
  const transformed = transformTutorialMarkup(read('tutorial.html'));
  assert.match(transformed, /id="seccion-1">1\. Agrupa el formulario con sentido/);
  assert.match(transformed, /id="seccion-4">4\. Verifica el recorrido/);
  assert.match(transformed, /Usa un elemento/);
  assert.match(transformed, /href="#seccion-3"/);
  assert.doesNotMatch(transformed, /Agrupá|Asociá|Explicá|Verificá|Usá|evitá|Elegí|agregá|Completá|Comprobá|Probá|Confirmá/);
});

test('global search exposes a filter for its curated editorial entries', () => {
  const html = read('buscar.html');
  assert.match(html, /<option value="editorial">Artículos<\/option>/);
});

test('a single tutorial card uses a restrained featured width and can grow with the grid', () => {
  const html = read('tutoriales.html');
  const css = read('styles.css');
  assert.match(html, /class="cards-grid tutorial-catalog-grid"/);
  assert.match(css, /\.tutorial-catalog-grid:has\(> \.card:only-child\)\s*\{[^}]*max-width:\s*760px;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('news pagination buttons expose disabled states and keep focus on the new results', () => {
  const page = read('js/news-page.mjs');
  assert.match(page, /previous\.disabled = page\.page === 1/);
  assert.match(page, /next\.disabled = page\.page === page\.pageCount/);
  assert.match(page, /setAttribute\('aria-controls', 'cardsContainer'\)/);
  assert.match(page, /firstLink\.focus\(/);
  assert.match(page, /grid\.scrollIntoView\(/);
  assert.match(page, /form\.addEventListener\([\s\S]*?currentPage = 1/);
  assert.match(page, /input\.addEventListener\([\s\S]*?currentPage = 1/);
  assert.match(page, /language\.addEventListener\([\s\S]*?currentPage = 1/);
  assert.match(page, /button\.addEventListener\([\s\S]*?currentPage = 1/);
});

test('the news static newsletter composer preserves one source form and adds one script', async () => {
  const { composeNewsletterOutput } = await import('../scripts/static-build-utils.mjs');
  const source = read('automatizaciones-n8n.html');
  const fallbackSection = '<section><form id="newsletterForm"></form></section>';
  const composed = composeNewsletterOutput(source, fallbackSection);
  assert.equal([...composed.matchAll(/id="newsletterForm"/g)].length, 1);
  assert.equal([...composed.matchAll(/src="js\/newsletter\.js"/g)].length, 1);
});

test('remaining owned public copy uses neutral tuteo in metadata and account flows', () => {
  const publicSources = [
    'sobre-nosotros.html', 'recursos.html', 'automatizaciones-gratis.html', 'automatizaciones-n8n.html',
    'gracias-pro.html', 'index.html', 'contacto.html', 'terminos-y-condiciones.html',
    'js/home-news.mjs', 'js/recovery.js', 'js/reset-password.js', 'js/admin/login.js',
    'js/supabase-client.js'
  ];
  const voseo = /(?:Conocé|Consultá|escribí|Recibí|Aprendé|explorá|creá|Accedé|Contactá|Leé|definí|Definí|identificá|Identificá|considerá|Considerá|probá|Probá|podés|Podés|tenés|Tenés|revisá|Revisá|iniciá|Iniciá|completá|Completá|ingresá|Ingresá|recargá|Recargá|redeployá|usá|Usá|elegí|Elegí|verificá|Verificá|confirmá|Confirmá|esperá|Esperá|reintentá|Reintentá|solicitá|Solicitá)/;
  for (const path of publicSources) assert.doesNotMatch(read(path), voseo, path);
});
