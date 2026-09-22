// Tests de la regla de disparo de novedades publicado→newsletter y del CSP
// del panel admin (causa raíz de que /api/newsletter-send nunca se llamara).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const decision = require('../js/admin/publish-decision');

const root = path.join(__dirname, '..');

test('publish-decision: notifica solo con transición real a publicado', () => {
  const should = decision.shouldNotifyNewsletter;
  // recurso NUEVO publicado de entrada → notificar
  assert.equal(should({ isNew: true, wasPublished: false, willBePublished: true }), true);
  // recurso existente NO publicado → pasa a publicado → notificar
  assert.equal(should({ isNew: false, wasPublished: false, willBePublished: true }), true);
  // se guarda un borrador → NO notificar
  assert.equal(should({ isNew: true, wasPublished: false, willBePublished: false }), false);
  assert.equal(should({ isNew: false, wasPublished: false, willBePublished: false }), false);
  // se edita un recurso ya publicado (p. ej. solo título/descripción) → NO
  assert.equal(should({ isNew: false, wasPublished: true, willBePublished: true }), false);
  // se despublica → NO notificar
  assert.equal(should({ isNew: false, wasPublished: true, willBePublished: false }), false);
});

test('CSP del admin permite fetch same-origin a /api/* (connect-src con self)', () => {
  for (const file of ['admin/index.html', 'admin/recurso-form.html']) {
    const html = readFileSync(path.join(root, file), 'utf8');
    const match = html.match(/connect-src\s+([^;]+);/);
    assert.ok(match, `${file} debe declarar connect-src`);
    assert.match(match[1], /'self'/, `${file} debe incluir 'self' en connect-src`);
    assert.match(match[1], /supabase\.co/, `${file} debe conservar el origen de Supabase`);
  }
});

test('recurso-form.html carga publish-decision.js antes del script del formulario', () => {
  const html = readFileSync(path.join(root, 'admin', 'recurso-form.html'), 'utf8');
  const indexDecision = html.indexOf('js/admin/publish-decision.js');
  const indexForm = html.indexOf('js/admin/recurso-form.js');
  assert.ok(indexDecision !== -1, 'debe incluir publish-decision.js');
  assert.ok(indexForm !== -1, 'debe incluir recurso-form.js');
  assert.ok(indexDecision < indexForm, 'publish-decision.js debe cargarse antes del form');
});