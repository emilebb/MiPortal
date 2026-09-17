-- Aplicar sobre una instalación existente; no vuelve a insertar recursos seed.
begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer') on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, email, role)
select id, email, 'viewer' from auth.users where email is not null
on conflict (id) do nothing;

create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid(); $$;

create or replace function public.protect_admin_role()
returns trigger language plpgsql security invoker set search_path = public
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
create trigger profiles_protect_admin_role before update of role on public.profiles
for each row execute function public.protect_admin_role();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.resources enable row level security;
grant usage on schema public to anon, authenticated;
grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "perfil_lectura_propia" on public.profiles;
create policy "perfil_lectura_propia" on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "perfil_edicion_propia" on public.profiles;
create policy "perfil_edicion_propia" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_profile_role());

-- Las instalaciones originales pueden usar private.is_admin() y políticas
-- más estrictas (por ejemplo created_by = auth.uid()). No añadir políticas
-- permisivas paralelas: alinear únicamente su comprobación con profiles.
do $migration$
begin
if to_regprocedure('private.is_admin()') is not null then
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Reconciliar administradores de user_roles antes de migrar a profiles';
  end if;
  execute $definition$
    create or replace function private.is_admin()
    returns boolean language sql stable security definer set search_path = ''
    as $body$
      select (select auth.uid()) is not null and exists (
        select 1 from public.profiles
        where id = (select auth.uid()) and role = 'admin'
      );
    $body$;
  $definition$;
else
drop policy if exists "recursos_publicos_lectura" on public.resources;
create policy "recursos_publicos_lectura" on public.resources
  for select to anon, authenticated using (published = true);
drop policy if exists "admin_lectura_total" on public.resources;
create policy "admin_lectura_total" on public.resources
  for select to authenticated using (public.is_admin());
drop policy if exists "solo_admin_insertar" on public.resources;
create policy "solo_admin_insertar" on public.resources
  for insert to authenticated with check (public.is_admin());
drop policy if exists "solo_admin_actualizar" on public.resources;
create policy "solo_admin_actualizar" on public.resources
  for update to authenticated using (public.is_admin())
  with check (public.is_admin());
drop policy if exists "solo_admin_eliminar" on public.resources;
create policy "solo_admin_eliminar" on public.resources
  for delete to authenticated using (public.is_admin());
end if;
end;
$migration$;

-- El trigger no es una RPC pública; las consultas de rol requieren sesión.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_profile_role() from public, anon;
grant execute on function public.current_profile_role() to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

commit;
