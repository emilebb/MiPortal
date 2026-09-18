-- MiPortal Pro: rol 'pro', historial de pagos y activación vía webhook.
-- Aplicar sobre una instalación existente (Supabase Dashboard → SQL Editor).
begin;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check
    check (role in ('viewer', 'admin', 'pro'));

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

-- Único punto de escritura del rol 'pro': se ejecuta desde el webhook con la
-- clave de servicio. Valida de nuevo los argumentos porque security definer
-- se ejecuta como su owner (postgres) y no debe aceptar input arbitrario.
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

commit;