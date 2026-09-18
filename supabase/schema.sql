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
             check (role in ('viewer', 'admin', 'pro')),
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

-- Incluye cuentas creadas antes del trigger, sin modificar roles existentes.
insert into public.profiles (id, email, role)
select id, email, 'viewer' from auth.users where email is not null
on conflict (id) do nothing;

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
drop policy if exists "perfil_lectura_propia" on public.profiles;
create policy "perfil_lectura_propia" on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Un usuario puede editar su propio perfil PERO NO su rol: el nuevo rol debe
-- coincidir con el rol actual (leído con security definer para evitar
-- recursión de RLS). Así nadie puede escalarse a admin desde el cliente.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "perfil_edicion_propia" on public.profiles;
create policy "perfil_edicion_propia" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

-- REFUERZO: a nivel de trigger, cambiar el rol solo es posible desde una
-- sesión con privilegios de base (postgres en el SQL Editor o service_role).
-- Cualquier otra sesión que intente modificar el rol de profiles es rechazada.
create or replace function public.protect_admin_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Operación no permitida: el rol solo puede cambiarlo un administrador de la base.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_role on public.profiles;
create trigger profiles_protect_admin_role
before update of role on public.profiles
for each row execute function public.protect_admin_role();


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
-- 3. TABLA payments + activación del rol Pro
--    Solo el webhook de Mercado Pago (con service_role) puede escribir aquí.
--    El rol 'pro' nunca se elige desde el cliente: lo confiere record_pro_payment.
-- ============================================================================
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  mp_payment_id  text not null unique check (mp_payment_id <> ''),
  amount         numeric not null check (amount > 0),
  currency       text not null default 'COP' check (length(currency) = 3),
  created_at     timestamptz not null default now()
);
alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;

create or replace function public.record_pro_payment(
  p_user_id uuid, p_payment_id text, p_amount numeric, p_currency text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  payment_registered boolean;
  profile_upgraded boolean;
begin
  if p_user_id is null or p_payment_id is null or p_payment_id = ''
     or p_amount is null or p_amount <= 0 or p_currency is null
     or length(p_currency) <> 3 then
    raise exception 'INVALID_PAYMENT';
  end if;

  select exists (select 1 from public.payments where mp_payment_id = p_payment_id)
    into payment_registered;
  if not payment_registered then
    insert into public.payments (user_id, mp_payment_id, amount, currency)
    values (p_user_id, p_payment_id, p_amount, upper(p_currency));
    payment_registered := true;
  end if;

  update public.profiles set role = 'pro' where id = p_user_id;
  profile_upgraded := found;

  return jsonb_build_object(
    'payment_registered', payment_registered,
    'profile_upgraded', profile_upgraded
  );
end; $$;

revoke all on function public.record_pro_payment(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.record_pro_payment(uuid, text, numeric, text) to service_role;


-- ============================================================================
-- 4. TABLA resources
-- ============================================================================
create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 160),
  description text not null check (char_length(trim(description)) between 1 and 1000),
  url         text not null check (url ~* '^https?://[^[:space:]]+$'),
  -- CONFIGURAR ROLES: si querés agregar más categorías, editá esta lista y
  -- actualizá el <select> de admin/recurso-form.html.
  -- El formulario admin exige https:// (validación client-side); el CHECK
  -- mantiene https?:// como superconjunto para filas importadas antes.
  category    text not null check (category in ('HTML','CSS','JavaScript','React','Fundamentos','Accesibilidad','Herramientas','Otros')),
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
grant usage on schema public to anon, authenticated;
grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
grant select, update on public.profiles to authenticated;

drop policy if exists "recursos_publicos_lectura" on public.resources;
create policy "recursos_publicos_lectura" on public.resources
  for select to anon, authenticated
  using (published = true);

-- Administradores pueden leer TODO (incluidos borradores).
drop policy if exists "admin_lectura_total" on public.resources;
create policy "admin_lectura_total" on public.resources
  for select to authenticated
  using (public.is_admin());

-- ESCRITURA: únicamente administradores.
drop policy if exists "solo_admin_insertar" on public.resources;
create policy "solo_admin_insertar" on public.resources
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "solo_admin_actualizar" on public.resources;
create policy "solo_admin_actualizar" on public.resources
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "solo_admin_eliminar" on public.resources;
create policy "solo_admin_eliminar" on public.resources
  for delete to authenticated
  using (public.is_admin());


-- ============================================================================
-- 5. DATOS INICIALES (seed)
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
-- 6. PROMOVER ADMINISTRADOR (EJECUTAR UNA SOLA VEZ)
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
