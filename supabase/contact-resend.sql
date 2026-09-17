-- Migración incremental: límites del envío directo, sin tocar la cola ni noticias.
begin;
create table if not exists public.contact_send_attempts (
  id bigint generated always as identity primary key,
  sender_hash text not null check (sender_hash ~ '^[a-f0-9]{64}$'),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists contact_send_attempts_created
  on public.contact_send_attempts(created_at);
alter table public.contact_send_attempts enable row level security;
revoke all on public.contact_send_attempts from public, anon, authenticated;
revoke all on sequence public.contact_send_attempts_id_seq
  from public, anon, authenticated;

create or replace function public.reserve_contact_attempt(
  p_sender_hash text, p_email_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checked_at timestamptz;
  hour_total integer;
  day_total integer;
  sender_total integer;
  email_total integer;
begin
  if p_sender_hash is null or p_email_hash is null or
     p_sender_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_HASH';
  end if;
  -- Un único bloqueo serializa lectura + reserva para todas las instancias.
  perform pg_catalog.pg_advisory_xact_lock(724190351);
  checked_at := clock_timestamp();
  delete from public.contact_send_attempts
    where created_at <= checked_at - interval '24 hours';
  select count(*),
    count(*) filter (where created_at > checked_at - interval '1 hour'),
    count(*) filter (where created_at > checked_at - interval '1 hour'
      and sender_hash = p_sender_hash),
    count(*) filter (where created_at > checked_at - interval '1 hour'
      and email_hash = p_email_hash)
    into day_total, hour_total, sender_total, email_total
    from public.contact_send_attempts;
  if day_total >= 100 then
    return jsonb_build_object('allowed', false, 'retry_after', 86400);
  end if;
  if hour_total >= 50 or sender_total >= 6 or email_total >= 6 then
    return jsonb_build_object('allowed', false, 'retry_after', 3600);
  end if;
  insert into public.contact_send_attempts(sender_hash, email_hash, created_at)
    values (p_sender_hash, p_email_hash, checked_at);
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;
revoke all on function public.reserve_contact_attempt(text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_contact_attempt(text, text) to service_role;
commit;
