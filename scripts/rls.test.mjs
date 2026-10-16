import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Base efímera aislada; nunca se conecta a contenedores o bases existentes.
test('Embedded PostgreSQL: repeatable setup, viewer isolation and admin CRUD', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const sql = input => db.exec(input);
  await sql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000001', 'admin@example.test', '{}');
  `);
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  await sql(schema);
  await sql(`do $$ begin
    if not exists (select 1 from public.profiles where
      id = '00000000-0000-0000-0000-000000000001' and role = 'viewer') then
      raise exception 'Pre-existing auth users need a viewer profile';
    end if;
  end $$;`);
  await sql(schema);
  const migration = await readFile(new URL(
    '../supabase/migrations/20260917_auth_roles.sql', import.meta.url), 'utf8');
  await sql(migration);
  await sql(migration);
  await sql(`
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000002', 'viewer@example.test',
       '{"role":"admin"}');
    update public.profiles set role = 'admin'
      where id = '00000000-0000-0000-0000-000000000001';
    insert into public.resources(title, description, url, category, published)
      values ('Private draft', 'Draft', 'https://example.test', 'HTML', false);
    set role anon;
    do $$ begin
      if exists(select 1 from public.resources where not published) then
        raise exception 'Anon saw drafts'; end if;
      begin
        insert into public.resources(title, description, url, category)
          values ('Forbidden', 'Test', 'https://example.test', 'HTML');
        raise exception 'Anon inserted resource';
      exception when insufficient_privilege then null; end;
    end $$;
    reset role;
    set role authenticated;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
    do $$ declare affected integer; begin
      if public.is_admin() then raise exception 'Metadata escalated role'; end if;
      if (select count(*) from public.profiles) <> 1 then
        raise exception 'Viewer read other profiles'; end if;
      if exists(select 1 from public.resources where not published) then
        raise exception 'Viewer saw drafts'; end if;
      begin
        update public.profiles set role = 'admin';
        raise exception 'Viewer escalated role';
      exception when insufficient_privilege then null;
        when raise_exception then
          if sqlerrm = 'Viewer escalated role' then raise; end if;
      end;
      update public.profiles set email = 'updated@example.test';
      if not exists(select 1 from public.profiles where email = 'updated@example.test')
        then raise exception 'Own profile edit failed'; end if;
      begin
        insert into public.resources(title, description, url, category)
          values ('Forbidden', 'Test', 'https://example.test', 'HTML');
        raise exception 'Viewer inserted resource';
      exception when insufficient_privilege then null; end;
      update public.resources set title = 'Forbidden';
      get diagnostics affected = row_count;
      if affected <> 0 then raise exception 'Viewer updated resources'; end if;
      delete from public.resources;
      get diagnostics affected = row_count;
      if affected <> 0 then raise exception 'Viewer deleted resources'; end if;
    end $$;
    set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
    do $$ declare resource_id uuid; affected integer; begin
      if not public.is_admin() then raise exception 'Admin role missing'; end if;
      if not exists(select 1 from public.resources where not published) then
        raise exception 'Admin cannot read drafts'; end if;
      insert into public.resources(title, description, url, category, published)
        values ('Admin test', 'Test', 'https://example.test', 'HTML', false)
        returning id into resource_id;
      update public.resources set published = true where id = resource_id;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Admin update failed'; end if;
      delete from public.resources where id = resource_id;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Admin delete failed'; end if;
    end $$;
  `);
});
