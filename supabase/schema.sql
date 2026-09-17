-- ============================================================================
-- MiPortal · Supabase · CRUD seguro de Recursos
-- ============================================================================
-- Cómo usar: Supabase Dashboard → SQL Editor → New query → pegar todo → Run.
-- Este script es idempotente en su mayoría (IF NOT EXISTS / OR REPLACE).
--
-- Requisitos previos:
--   1) Crear el usuario administrador: Authentication → Users → Add user
--      (email + contraseña). Confirmar el email en el inbox antes de probar.
--   2) Ejecutar este script.
--   3) Promover al admin con el UPDATE del final de este archivo.
-- ============================================================================


-- ============================================================================
-- 1. TABLA profiles
--    Identifica administradores de forma segura. El role de control es del
--    lado del servidor: el cliente NUNCA puede decidir su propio rol, solo
--    el trigger (security definer) puede insertar el perfil con role 'viewer'
--    y el admin puede ser promovido únicamente con SQL (postgres/service_role).
-- ============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'viewer'
             check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse un usuario en Auth.
-- IMPORTANTE: security definer + search_path fijo para evitar escalación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- updated_at automático en profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Cada usuario solo puede ver/editar su propio perfil.
create policy "perfil_lectura_propia" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "perfil_edicion_propia" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ============================================================================
-- 2. FUNCIÓN is_admin()
--    Única fuente de verdad para "¿este usuario es administrador?".
--    security definer: ejecuta como el owner de la tabla, sin RLS, por eso
--    NO hay recursión con las políticas de profiles.
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Conceder ejecución a los roles autenticados (lo usa RLS).
grant execute on function public.is_admin() to authenticated;


-- ============================================================================
-- 3. TABLA resources
-- ============================================================================
create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 200),
  description text not null check (char_length(trim(description)) between 1 and 1000),
  url         text not null check (url ~* '^https?://[^[:space:]]+$'),
  -- CONFIGURAR ROLES: si querés agregar más categorías, editá esta lista y
  -- actualizá el <select> de admin/recurso-form.html.
  -- El formulario admin exige https:// (validación client-side); el CHECK
  -- mantiene https?:// como superconjunto para filas importadas antes.
  category    text not null check (category in ('HTML','CSS','JavaScript','Accesibilidad','Herramientas','Otros')),
  image_url   text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null default auth.uid()
);

-- Índices para la consulta pública (pubicados, ordenados por fecha).
create index if not exists resources_published_idx on public.resources (published);
create index if not exists resources_created_at_idx on public.resources (created_at desc);

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

alter table public.resources enable row level security;

-- VISITANTES SOLO LECTURA de lo publicado (anon y authenticated).
create policy "recursos_publicos_lectura" on public.resources
  for select to anon, authenticated
  using (published = true);

-- Administradores pueden leer TODO (incluidos borradores).
create policy "admin_lectura_total" on public.resources
  for select to authenticated
  using (public.is_admin());

-- ESCRITURA: únicamente administradores.
create policy "solo_admin_insertar" on public.resources
  for insert to authenticated
  with check (public.is_admin());

create policy "solo_admin_actualizar" on public.resources
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "solo_admin_eliminar" on public.resources
  for delete to authenticated
  using (public.is_admin());


-- ============================================================================
-- 4. DATOS INICIALES (seed)
--    Replica el contenido fijo actual de recursos.html para que la página
--    siga igual inmediatamente después de activar la base de datos.
--    created_by = NULL porque fueron importados manualmente.
-- ============================================================================
insert into public.resources (title, description, url, category, image_url, published)
values
  ('MDN Web Docs', 'Referencia completa de HTML, CSS y APIs web.', 'https://developer.mozilla.org/es/', 'HTML', null, true),
  ('CSS-Tricks', 'Guías y ejemplos prácticos para construir interfaces.', 'https://css-tricks.com/', 'CSS', null, true),
  ('WebAIM', 'Recursos para crear sitios web más accesibles.', 'https://webaim.org/', 'Accesibilidad', null, true)
on conflict do nothing;


-- ============================================================================
-- 5. PROMOVER ADMINISTRADOR (EJECUTAR UNA SOLA VEZ)
--    Reemplazá TU_EMAIL_ADMIN@ejemplo.com por el email del usuario que creaste
--    en Authentication → Users. Sin este paso, el login admin no concederá
--    permisos de escritura.
-- ============================================================================
-- update public.profiles
-- set role = 'admin', updated_at = now()
-- where email = 'TU_EMAIL_ADMIN@ejemplo.com';
--
-- -- VERTIFICACIÓN (debe devolver al menos una fila con role = admin):
-- select p.email, p.role
-- from public.profiles p
-- order by p.created_at desc;