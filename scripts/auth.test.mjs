import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

function element(id = '') {
  return {
    id, value: '', hidden: id === 'errorMessages', textContent: '',
    children: [], attributes: {}, handlers: {}, disabled: false,
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(k, fn) { this.handlers[k] = fn; },
    querySelectorAll() { return []; },
    replaceChildren(...children) { this.children = children; },
    focus() { this.focused = true; }
  };
}

async function setup(file, options = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element(id));
    return nodes.get(id);
  };
  let session = options.existing ? { user: { id: 'user' } } : null;
  const calls = { signOut: 0, update: 0, reset: [] };
  let listener;
  const client = {
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async () => {
        session = { user: { id: 'user' } };
        return { data: session, error: options.loginError };
      },
      signUp: async () => ({ data: { session: options.confirm ? null : {} } }),
      signOut: async () => {
        calls.signOut++;
        if (options.logoutError) return { error: new Error('Offline') };
        session = null;
        return {};
      },
      resetPasswordForEmail: async (...args) => {
        calls.reset.push(args);
        return { error: options.resetError };
      },
      updateUser: async () => { calls.update++; return { error: options.updateError }; },
      onAuthStateChange: fn => { listener = fn; return { data: {} }; }
    },
    from: () => ({ select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({
        data: options.missingProfile ? null : { role: options.role || 'viewer' },
        error: options.profileError
      }) })
  };
  const window = {
    MiPortalSupabase: options.noConfig ? null : client,
    location: { origin: 'https://portal.test', pathname: '/login.html',
      search: options.search || '', hash: options.hash || '',
      replace(url) { calls.redirect = url; } },
    history: { replaceState() {} }, setTimeout
  };
  await runInNewContext(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), {
    window, document: { getElementById: node, createElement: element,
      querySelectorAll: () => [] }, URL, URLSearchParams, setTimeout, console
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  return { node, calls, window, client,
    event: async name => { listener?.(name, session); await new Promise(r => setTimeout(r, 10)); },
    submit: async id => node(id).handlers.submit({ preventDefault() {} }) };
}

for (const role of ['viewer', 'admin']) {
  test(`${role}: password login and existing session persist`, async () => {
    for (const existing of [false, true]) {
      const h = await setup('js/admin/login.js', { role, existing });
      if (!existing) {
        h.node('email').value = 'user@example.test';
        h.node('password').value = 'password';
        await h.submit('loginForm');
      }
      assert.equal(h.calls.signOut, 0);
      assert.equal(h.calls.redirect, role === 'admin' ? '/admin/' : '/index.html');
    }
  });
  test(`${role}: navigation persists across token refresh`, async () => {
    const h = await setup('js/auth-nav.js', { role, existing: true });
    await h.event('TOKEN_REFRESHED');
    assert.equal(h.calls.signOut, 0);
    const items = h.node('auth-nav-item').children;
    assert.equal(items.some(n => n.href === '/admin/'), role === 'admin');
    assert.ok(items.some(n => n.textContent === 'Cerrar sesión'));
  });
  test(`${role}: admin guard enforces role without destroying session`, async () => {
    const h = await setup('js/admin/shared.js', { role, existing: true });
    assert.equal(await h.window.Admin.requireAdmin(), role === 'admin' ? h.client : null);
    assert.equal(h.calls.signOut, 0);
  });
}

test('login validation exposes and focuses the associated error', async () => {
  const h = await setup('js/admin/login.js');
  await h.submit('loginForm');
  assert.equal(h.node('errorMessages').hidden, false);
  assert.equal(h.node('email').attributes['aria-describedby'], 'errorMessages');
  assert.equal(h.node('email').focused, true);
});

test('profile lookup failure preserves session and shows login error', async () => {
  const h = await setup('js/admin/login.js', { existing: true, profileError: {} });
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.calls.redirect, undefined);
  assert.ok(h.node('loginAlert').textContent);
});

test('viewer cannot follow admin next; external next is rejected', async () => {
  for (const search of ['?next=/admin/recurso-form.html', '?next=//evil.test']) {
    const h = await setup('js/admin/login.js', { existing: true, search });
    assert.equal(h.calls.redirect, '/index.html');
  }
});

test('registration preserves immediate session and exposes invalid input', async () => {
  const h = await setup('js/register.js');
  await h.submit('registerForm');
  assert.equal(h.node('errorMessages').hidden, false);
  h.node('email').value = 'user@example.test';
  h.node('password').value = h.node('confirmPassword').value = 'password';
  await h.submit('registerForm');
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.calls.redirect, '/index.html');
});

test('failed logout retains authenticated navigation and reports failure', async () => {
  const h = await setup('js/auth-nav.js', { role: 'admin', existing: true,
    logoutError: true });
  await h.node('auth-nav-item').children.find(n => n.type === 'button').handlers.click();
  assert.ok(h.node('auth-nav-item').children.some(n => n.href === '/admin/'));
  assert.ok(h.node('auth-nav-item').children.some(n => n.attributes.role === 'alert'));
});

test('recovery requests email with fixed local callback', async () => {
  const h = await setup('js/recovery.js');
  h.node('email').value = 'user@example.test';
  await h.submit('recoveryForm');
  assert.equal(h.calls.reset[0][1].redirectTo, 'https://portal.test/reset-password.html');
});

test('reset requires recovery event, validates confirmation, and updates password', async () => {
  const h = await setup('js/reset-password.js', { existing: true });
  h.node('password').value = h.node('confirmPassword').value = 'new-password';
  await h.submit('resetForm');
  assert.equal(h.calls.update, 0);
  await h.event('PASSWORD_RECOVERY');
  h.node('confirmPassword').value = 'different';
  await h.submit('resetForm');
  assert.equal(h.calls.update, 0);
  h.node('confirmPassword').value = 'new-password';
  await h.submit('resetForm');
  assert.equal(h.calls.update, 1);
  assert.equal(h.calls.signOut, 1);
  assert.equal(h.node('resetForm').hidden, true);
});

test('recovery network failure is visible and retry stays available', async () => {
  const h = await setup('js/recovery.js', { resetError: {} });
  h.node('email').value = 'user@example.test';
  await h.submit('recoveryForm');
  assert.match(h.node('recoveryAlert').textContent, /No se pudo enviar/);
  assert.equal(h.node('submitButton').disabled, false);
  assert.equal(h.node('recoveryForm').attributes['aria-busy'], 'false');
});

test('expired recovery update fails visibly without claiming success', async () => {
  const h = await setup('js/reset-password.js', { existing: true, updateError: {} });
  await h.event('PASSWORD_RECOVERY');
  h.node('password').value = h.node('confirmPassword').value = 'new-password';
  await h.submit('resetForm');
  assert.match(h.node('resetAlert').textContent, /No se pudo actualizar/);
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.node('resetForm').hidden, false);
  assert.equal(h.node('submitButton').disabled, false);
});

test('missing configuration disables both recovery forms', async () => {
  for (const file of ['recovery', 'reset-password']) {
    const h = await setup(`js/${file}.js`, { noConfig: true });
    assert.equal(h.node('submitButton').disabled, true);
    assert.match(h.node(file === 'recovery' ? 'recoveryAlert' : 'resetAlert')
      .textContent, /Falta configurar/);
  }
});

test('missing profile and anonymous sessions cannot enter admin', async () => {
  for (const options of [{}, { existing: true, missingProfile: true },
    { existing: true, profileError: {} }]) {
    const h = await setup('js/admin/shared.js', options);
    assert.equal(await h.window.Admin.requireAdmin(), null);
    assert.match(h.calls.redirect, /login\.html/);
    assert.equal(h.calls.signOut, 0);
  }
});

test('bad credentials show an alert and allow retry', async () => {
  const h = await setup('js/admin/login.js', { loginError: {} });
  h.node('email').value = 'user@example.test';
  h.node('password').value = 'wrong';
  await h.submit('loginForm');
  assert.match(h.node('loginAlert').textContent, /incorrectos/);
  assert.equal(h.calls.redirect, undefined);
  assert.equal(h.node('submitButton').disabled, false);
});

test('admin next preserves local destination and rejects external destinations', async () => {
  for (const [next, expected] of [
    ['/admin/recurso-form.html?id=123', '/admin/recurso-form.html?id=123'],
    ['https://evil.test', '/admin/'], ['//evil.test', '/admin/'],
    ['/login.html', '/admin/']
  ]) {
    const h = await setup('js/admin/login.js', { existing: true, role: 'admin',
      search: '?next=' + encodeURIComponent(next) });
    assert.equal(h.calls.redirect, expected);
  }
});

test('registration awaiting confirmation does not create a fake session', async () => {
  const h = await setup('js/register.js', { confirm: true });
  h.node('email').value = 'user@example.test';
  h.node('password').value = h.node('confirmPassword').value = 'password';
  await h.submit('registerForm');
  assert.equal(h.calls.redirect, undefined);
  assert.equal(h.node('registerForm').hidden, true);
  assert.match(h.node('registerAlert').textContent, /confirmar/);
});
