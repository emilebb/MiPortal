const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

test('built static site excludes private contact configuration and server artifacts',
  () => {
    const root = join(__dirname, '..', 'public');
    assert.ok(existsSync(join(root, 'js', 'contact.js')), 'Run npm run build first');
    for (const name of ['api', 'n8n', 'supabase', 'scripts', 'CONTACT-SETUP.md']) {
      assert.equal(existsSync(join(root, name)), false, `${name} must stay private`);
    }
    const inspect = directory => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        assert.equal(entry.name.startsWith('.env'), false);
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { inspect(path); continue; }
        const content = readFileSync(path, 'utf8');
        assert.equal(/CONTACT_TEST_(?:RESEND|DB|HASH)_SECRET_SENTINEL/.test(content),
          false, `Secret sentinel in ${entry.name}`);
        assert.equal(/(?:sender|recipient)@build-fixture\.invalid/.test(content),
          false, `Server-only address in ${entry.name}`);
        assert.equal(/RESEND_API_KEY|SUPABASE_SECRET_KEY|CONTACT_HASH_SECRET/
          .test(content), false, `Server configuration in ${entry.name}`);
      }
    };
    inspect(root);
    assert.match(readFileSync(join(root, 'contacto.html'), 'utf8'),
      /connect-src 'self'/);
  });
