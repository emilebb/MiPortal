-- Allow the public site to read MiPortal Daily without exposing write access.
begin;

alter table public.miportal_daily enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.miportal_daily to anon, authenticated;
revoke insert, update, delete on table public.miportal_daily from anon, authenticated;

drop policy if exists miportal_daily_public_select on public.miportal_daily;
create policy miportal_daily_public_select on public.miportal_daily
  for select to anon, authenticated
  using (true);

commit;
