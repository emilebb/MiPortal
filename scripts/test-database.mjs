import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;`);
  return db;
}
export async function applyFile(db, path) {
  await db.exec(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}
