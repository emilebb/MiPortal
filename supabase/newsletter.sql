-- Additive, repeatable newsletter storage and server-only RPCs.
begin;
create table if not exists public.newsletter_subscribers (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  email text not null check (length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from public, anon, authenticated;

create table if not exists public.newsletter_attempts (
  id bigint generated always as identity primary key,
  sender_hash text not null check (sender_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists newsletter_attempts_created on public.newsletter_attempts(created_at);
alter table public.newsletter_attempts enable row level security;
revoke all on public.newsletter_attempts from public, anon, authenticated;
revoke all on sequence public.newsletter_attempts_id_seq from public, anon, authenticated;

create or replace function public.reserve_newsletter_attempt(p_sender_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare checked_at timestamptz; total integer; sender_total integer;
begin
  if p_sender_hash is null or p_sender_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH'; end if;
  perform pg_catalog.pg_advisory_xact_lock(724190352);
  checked_at := clock_timestamp();
  delete from public.newsletter_attempts where created_at <= checked_at - interval '24 hours';
  select count(*), count(*) filter (where sender_hash = p_sender_hash)
    into total, sender_total from public.newsletter_attempts
    where created_at > checked_at - interval '1 hour';
  if total >= 30 or sender_total >= 5 then return jsonb_build_object('allowed', false); end if;
  insert into public.newsletter_attempts(sender_hash, created_at) values (p_sender_hash, checked_at);
  return jsonb_build_object('allowed', true);
end; $$;

create or replace function public.upsert_newsletter_subscriber(p_email text, p_email_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  if p_email is null or p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SUBSCRIBER'; end if;
  insert into public.newsletter_subscribers(email, email_hash)
    values (p_email, p_email_hash)
    on conflict (email_hash) do update set email = excluded.email,
        status = case when public.newsletter_subscribers.status = 'unsubscribed'
          then 'pending' else public.newsletter_subscribers.status end,
        updated_at = now()
    returning status into current_status;
  return jsonb_build_object('status', current_status);
end; $$;

create or replace function public.update_newsletter_status(p_email_hash text, p_status text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' or p_status not in ('confirmed', 'unsubscribed') then raise exception 'INVALID_STATUS'; end if;
  update public.newsletter_subscribers set status = p_status, updated_at = now() where email_hash = p_email_hash;
  return found;
end; $$;

revoke all on function public.reserve_newsletter_attempt(text), public.upsert_newsletter_subscriber(text,text), public.update_newsletter_status(text,text) from public, anon, authenticated;
grant execute on function public.reserve_newsletter_attempt(text), public.upsert_newsletter_subscriber(text,text), public.update_newsletter_status(text,text) to service_role;
commit;