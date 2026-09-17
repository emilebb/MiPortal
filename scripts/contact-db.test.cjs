const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(String(value)).digest('hex');

test('contact RPC in disposable offline PostgreSQL, never production', async t => {
  const container = `miportal-contact-test-${randomUUID()}`;
  const start = spawnSync('docker', ['run', '--detach', '--rm', '--pull', 'never',
    '--network', 'none',
    '--name', container, '--tmpfs', '/var/lib/postgresql/data',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine'],
  { encoding: 'utf8', timeout: 30000 });
  assert.equal(start.status, 0, start.stderr);
  t.after(() => {
    const stop = spawnSync('docker', ['stop', '--time', '2', container],
      { encoding: 'utf8', timeout: 10000 });
    assert.equal(stop.status, 0, stop.stderr);
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-h',
      '127.0.0.1', '-U', 'postgres'], { encoding: 'utf8' });
    if (result.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Disposable PostgreSQL must start');
  const sql = (query, successful = true) => {
    const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U',
      'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    { input: query, encoding: 'utf8', timeout: 15000 });
    if (successful) assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const call = (sender, email) => `set role service_role;
    select public.reserve_contact_attempt('${hash(sender)}','${hash(email)}');`;
  sql(`create role anon; create role authenticated;
    create role service_role bypassrls;`);
  sql(readFileSync(new URL('../supabase/n8n-setup.sql', `file://${__filename}`),
    'utf8'));
  sql(`insert into public.contact_messages(name,email,message,sender_hash)
    values ('Fixture','test@example.com','Legacy queue fixture','fixture');
    insert into public.news_articles(url,title,source,published_at)
    values ('https://example.test/news','Fixture news','Fixture',now());`);
  const migration = readFileSync(new URL('../supabase/contact-resend.sql',
    `file://${__filename}`), 'utf8');
  sql(migration);
  sql(migration);
  await t.test('only service role can reserve; anonymous cannot read hashes', () => {
    for (const role of ['anon', 'authenticated']) {
      assert.notEqual(sql(`set role ${role}; select * from
        public.contact_send_attempts;`, false).status, 0);
      assert.notEqual(sql(`set role ${role}; select
        public.reserve_contact_attempt('${hash(1)}','${hash(1)}');`, false).status, 0);
    }
    assert.notEqual(sql(`set role service_role; select
      public.reserve_contact_attempt('bad','bad');`, false).status, 0);
  });
  await t.test('concurrent instances atomically enforce six attempts per IP', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => exec(
      'docker', ['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-Atq', '-c', call('same-ip', i)]
    )));
    const decisions = results.map(result => JSON.parse(result.stdout));
    assert.equal(decisions.filter(result => result.allowed).length, 6);
    assert.equal(decisions.filter(result => result.retry_after === 3600).length, 6);
    assert.equal(sql('select count(*) from public.contact_send_attempts;')
      .stdout.trim(), '6');
  });
  await t.test('email limit spans IPs and hourly limits expire', () => {
    sql('delete from public.contact_send_attempts;');
    for (let i = 0; i < 7; i++) {
      assert.equal(JSON.parse(sql(call(i, 'same-email')).stdout).allowed, i < 6);
    }
    sql(`update public.contact_send_attempts
      set created_at = now() - interval '61 minutes';`);
    assert.equal(JSON.parse(sql(call(1, 'same-email')).stdout).allowed, true);
  });
  await t.test('global hour/day budgets and retention bound distributed abuse', () => {
    sql(`delete from public.contact_send_attempts;
      insert into public.contact_send_attempts(sender_hash,email_hash)
      select repeat('a',64),repeat('b',64) from generate_series(1,50);`);
    assert.equal(JSON.parse(sql(call('new-ip', 'new-email')).stdout).allowed, false);
    sql(`update public.contact_send_attempts
      set created_at = now() - interval '2 hours';
      insert into public.contact_send_attempts(sender_hash,email_hash,created_at)
      select repeat('a',64),repeat('b',64),now()-interval '2 hours'
      from generate_series(1,50);`);
    const day = JSON.parse(sql(call('new-ip', 'new-email')).stdout);
    assert.deepEqual(day, { allowed: false, retry_after: 86400 });
    sql(`update public.contact_send_attempts
      set created_at = now() - interval '25 hours';`);
    assert.equal(JSON.parse(sql(call('new-ip', 'new-email')).stdout).allowed, true);
    assert.equal(sql('select count(*) from public.contact_send_attempts;')
      .stdout.trim(), '1');
  });
  await t.test('direct reservations never touch legacy queue or news', () => {
    assert.equal(sql('select count(*) from public.contact_messages;').stdout.trim(), '1');
    assert.equal(sql('select count(*) from public.news_articles;').stdout.trim(), '1');
    assert.equal(sql(`select count(*) from public.contact_messages
      where notified_at is null and attempts=0;`).stdout.trim(), '1');
  });
});
