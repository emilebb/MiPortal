-- Verificación remota con rollback: ejecutar como postgres, nunca con una clave
-- pública. Requiere al menos un perfil viewer. No prueba entrega de correo ni
-- autenticación HTTP; verifica las políticas con roles y claims controlados.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role='viewer' order by created_at limit 1), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
select set_config('miportal.test_resource', gen_random_uuid()::text,true);
insert into public.resources(id,title,description,url,category,published,created_by)
values(current_setting('miportal.test_resource')::uuid,'MiPortal RLS verification','Temporary rollback-only record','https://example.com','Otros',false,auth.uid());
set local role authenticated;
do $test$ begin
if private.is_admin() then raise exception 'Viewer detected as admin'; end if;
if exists(select 1 from public.resources where id=current_setting('miportal.test_resource')::uuid) then raise exception 'Viewer read draft'; end if;
begin
insert into public.resources(title,description,url,category) values('Forbidden viewer write','Must fail','https://example.com','Otros');
raise exception 'Viewer insert unexpectedly allowed';
exception when insufficient_privilege then null; end;
update public.resources set title='Forbidden' where id=current_setting('miportal.test_resource')::uuid;
if found then raise exception 'Viewer update allowed'; end if;
delete from public.resources where id=current_setting('miportal.test_resource')::uuid;
if found then raise exception 'Viewer delete allowed'; end if;
begin
update public.profiles set role='admin' where id=auth.uid();
raise exception using errcode='ZX001',message='Role escalation allowed';
exception when insufficient_privilege then null;
when raise_exception then
if sqlerrm not like 'Operación no permitida:%' then raise; end if;
end;
end $test$;
reset role;
update public.profiles set role='admin' where id=auth.uid();
set local role authenticated;
do $test$ declare new_id uuid; begin
if not private.is_admin() then raise exception 'Admin not recognized'; end if;
if not exists(select 1 from public.resources where id=current_setting('miportal.test_resource')::uuid) then raise exception 'Admin cannot read draft'; end if;
insert into public.resources(title,description,url,category,published)
values('Admin verification','Temporary rollback-only record','https://example.com','Otros',false) returning id into new_id;
update public.resources set published=true where id=new_id;
if not found then raise exception 'Admin update failed'; end if;
delete from public.resources where id=new_id;
if not found then raise exception 'Admin delete failed'; end if;
update public.resources set published=true where id=current_setting('miportal.test_resource')::uuid;
end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $test$ begin
if not exists(select 1 from public.resources where id=current_setting('miportal.test_resource')::uuid) then raise exception 'Anon cannot read published'; end if;
begin
insert into public.resources(title,description,url,category) values('Forbidden anon write','Must fail','https://example.com','Otros');
raise exception 'Anon insert unexpectedly allowed';
exception when insufficient_privilege then null; end;
end $test$;
reset role;
update public.resources set published=false where id=current_setting('miportal.test_resource')::uuid;
set local role anon;
do $test$ begin
if exists(select 1 from public.resources where id=current_setting('miportal.test_resource')::uuid) then raise exception 'Anon read draft'; end if;
end $test$;
reset role;
rollback;
select 'PASS: viewer restrictions, role escalation prevention, admin CRUD, public visibility; transaction rolled back' as result;
