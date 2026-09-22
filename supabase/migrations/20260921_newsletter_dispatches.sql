-- ============================================================================
-- MiPortal · Novedades automáticas por correo (Newsletter al publicar)
-- ============================================================================
-- Aplicar sobre una instalación existente (Supabase Dashboard → SQL Editor).
-- Single file: idempotente (IF NOT EXISTS / OR REPLACE). No toca las tablas
-- newsletter_subscribers / newsletter_attempts existentes.
--
-- Flujo:
--   resources.published → true (nuevo o cambio) ⇒ el trigger encola un
--   newsletter_dispatches (idempotente por resource_id). El endpoint Vercel
--   reclama la cola, envía por Resend (batch) y registra cada envío en
--   newsletter_sends para impedir duplicados.
--
-- Seguridad: todo revocado a anon/authenticated; solo RPCs security definer
-- ejecutables por service_role (solo servidor). Nada de esto llega al browser.
-- ============================================================================
begin;

-- ── 1. Cola de envíos por publicación ──────────────────────────────────────
create table if not exists public.newsletter_dispatches (
  id                uuid primary key default gen_random_uuid(),
  resource_id       uuid not null unique references public.resources(id)
                    on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  resource_snapshot jsonb not null,
  total_recipients  integer not null default 0,
  sent_count        integer not null default 0,
  failed_count      integer not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists newsletter_dispatches_status_created
  on public.newsletter_dispatches (status, created_at);
alter table public.newsletter_dispatches enable row level security;
revoke all on public.newsletter_dispatches from public, anon, authenticated;

-- ── 2. Registro por destinatario (idempotencia por resource + hash) ────────
create table if not exists public.newsletter_sends (
  id          uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.newsletter_dispatches(id)
              on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  email_hash  text not null references public.newsletter_subscribers(email_hash)
              on delete cascade,
  status      text not null check (status in ('sent', 'failed')),
  attempts    integer not null default 0,
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un mismo suscriptor jamás recibe dos veces la misma publicación.
  unique (resource_id, email_hash)
);
create index if not exists newsletter_sends_resource_idx
  on public.newsletter_sends (resource_id);
create index if not exists newsletter_sends_dispatch_idx
  on public.newsletter_sends (dispatch_id);
alter table public.newsletter_sends enable row level security;
revoke all on public.newsletter_sends from public, anon, authenticated;

-- ── 3. Throttle del endpoint de envío (antiabuso, no sustituye al JWT) ─────
create table if not exists public.newsletter_dispatch_calls (
  id          bigint generated always as identity primary key,
  sender_hash text not null check (sender_hash ~ '^[a-f0-9]{64}$'),
  created_at  timestamptz not null default clock_timestamp()
);
create index if not exists newsletter_dispatch_calls_created
  on public.newsletter_dispatch_calls (created_at);
alter table public.newsletter_dispatch_calls enable row level security;
revoke all on public.newsletter_dispatch_calls from public, anon, authenticated;
revoke all on sequence public.newsletter_dispatch_calls_id_seq from public, anon, authenticated;

-- ── 4. Trigger: encolar al publicar ─────────────────────────────────────────
-- Se dispara en INSERT (publicado de entrada) y en UPDATE cuando el recurso
-- PASÓ a publicado. Editar un recurso ya publicado no re-encola (publicación
-- sin transición de estado). Re-publicar tras despublicar tampoco re-encola:
-- la cola es idempotente por resource_id.
create or replace function public.enqueue_newsletter_dispatch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published
     and (TG_OP = 'INSERT' or old.published is distinct from new.published) then
    insert into public.newsletter_dispatches(resource_id, resource_snapshot)
    values (new.id, to_jsonb(new))
    on conflict (resource_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists resources_newsletter_dispatch on public.resources;
create trigger resources_newsletter_dispatch
after insert or update on public.resources
for each row execute function public.enqueue_newsletter_dispatch();
revoke all on function public.enqueue_newsletter_dispatch() from public, anon, authenticated;

-- ── 5. Reclamar el próximo envío pendiente (o uno puntual por recurso) ─────
-- Fija status=processing de forma atómica. Protege contra ejecuciones
-- concurrentes: advisory lock + FOR UPDATE SKIP LOCKED. Un envío que quedó
-- 'processing' por un timeout se recupera pasada la antigüedad indicada.
create or replace function public.claim_newsletter_dispatch(
  p_resource_id uuid default null,
  p_stale_after_seconds integer default 900
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  claimed record;
begin
  perform pg_catalog.pg_advisory_xact_lock(724190353);
  update public.newsletter_dispatches set status = 'processing', updated_at = now()
  where id = (
    select d.id from public.newsletter_dispatches d
    where (d.status = 'pending'
       or (d.status = 'processing'
           and d.updated_at < now() - make_interval(secs => greatest(p_stale_after_seconds, 60))))
      and (p_resource_id is null or d.resource_id = p_resource_id)
    order by (p_resource_id is not null and d.resource_id = p_resource_id) desc, d.created_at
    limit 1
    for update skip locked
  )
  returning * into claimed;
  if claimed.id is null then return null; end if;
  return jsonb_build_object(
    'id', claimed.id, 'resource_id', claimed.resource_id,
    'status', claimed.status, 'resource_snapshot', claimed.resource_snapshot,
    'created_at', claimed.created_at);
end; $$;

-- ── 6. Completar un envío ───────────────────────────────────────────────────
create or replace function public.complete_newsletter_dispatch(
  p_dispatch_id uuid, p_status text, p_sent integer, p_failed integer,
  p_total integer, p_error text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_dispatch_id is null or p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'INVALID_DISPATCH';
  end if;
  update public.newsletter_dispatches
     set status = p_status, sent_count = greatest(p_sent, 0),
         failed_count = greatest(p_failed, 0), total_recipients = greatest(p_total, 0),
         error = nullif(p_error, ''), updated_at = now()
   where id = p_dispatch_id;
  return found;
end; $$;

-- ── 7. Registro masivo de resultados (evita cientos de INSERT individuales) ─
-- p_results: [{ "email_hash", "status", "resend_id", "error" }]. Un envio
-- 'failed' incrementa attempts; repetir el mismo resultado es idempotente.
create or replace function public.record_newsletter_sends(
  p_dispatch_id uuid, p_resource_id uuid, p_results jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  entry jsonb; recorded integer := 0;
begin
  if p_dispatch_id is null or p_resource_id is null
     or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'INVALID_RESULTS';
  end if;
  for entry in select * from jsonb_array_elements(p_results) loop
    if entry->>'email_hash' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH'; end if;
    insert into public.newsletter_sends
      (dispatch_id, resource_id, email_hash, status, attempts, resend_id, error)
    values (p_dispatch_id, p_resource_id, entry->>'email_hash',
            case when entry->>'status' = 'sent' then 'sent' else 'failed' end,
            case when entry->>'status' = 'sent' then 0 else 1 end,
            nullif(entry->>'resend_id', ''), nullif(entry->>'error', ''))
    on conflict (resource_id, email_hash) do update set
      status = excluded.status,
      attempts = case when excluded.status = 'failed'
                 then public.newsletter_sends.attempts + 1
                 else public.newsletter_sends.attempts end,
      resend_id = coalesce(excluded.resend_id, public.newsletter_sends.resend_id),
      error = coalesce(excluded.error, public.newsletter_sends.error),
      updated_at = now();
    recorded := recorded + 1;
  end loop;
  return jsonb_build_object('recorded', recorded);
end; $$;

-- ── 8. Lecturas (solo servidor) ─────────────────────────────────────────────
create or replace function public.list_confirmed_subscribers()
returns table (email text, email_hash text)
language sql stable security definer set search_path = '' as $$
  select s.email, s.email_hash from public.newsletter_subscribers s
  where s.status = 'confirmed';
$$;

create or replace function public.list_newsletter_sent(p_resource_id uuid)
returns table (email_hash text, status text, attempts integer)
language sql stable security definer set search_path = '' as $$
  select s.email_hash, s.status, s.attempts from public.newsletter_sends s
  where s.resource_id = p_resource_id;
$$;

create or replace function public.user_is_admin(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = p_uid and role = 'admin');
$$;

-- ── 9. Throttle del endpoint ────────────────────────────────────────────────
-- 60 llamadas/hora a nivel global y 20/hora por remitente: es un candado
-- antiabuso por encima del JWT de administrador, no un límite de negocio.
create or replace function public.reserve_dispatch_call(p_sender_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare checked_at timestamptz; total integer; sender_total integer;
begin
  if p_sender_hash is null or p_sender_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH'; end if;
  perform pg_catalog.pg_advisory_xact_lock(724190352);
  checked_at := clock_timestamp();
  delete from public.newsletter_dispatch_calls
    where created_at <= checked_at - interval '24 hours';
  select count(*), count(*) filter (where sender_hash = p_sender_hash)
    into total, sender_total from public.newsletter_dispatch_calls
    where created_at > checked_at - interval '1 hour';
  if total >= 60 or sender_total >= 20 then return jsonb_build_object('allowed', false); end if;
  insert into public.newsletter_dispatch_calls(sender_hash, created_at)
    values (p_sender_hash, checked_at);
  return jsonb_build_object('allowed', true);
end; $$;

revoke all on function public.claim_newsletter_dispatch(uuid, integer),
  public.complete_newsletter_dispatch(uuid, text, integer, integer, integer, text),
  public.record_newsletter_sends(uuid, uuid, jsonb),
  public.list_confirmed_subscribers(),
  public.list_newsletter_sent(uuid),
  public.user_is_admin(uuid),
  public.reserve_dispatch_call(text)
  from public, anon, authenticated;
grant execute on function public.claim_newsletter_dispatch(uuid, integer),
  public.complete_newsletter_dispatch(uuid, text, integer, integer, integer, text),
  public.record_newsletter_sends(uuid, uuid, jsonb),
  public.list_confirmed_subscribers(),
  public.list_newsletter_sent(uuid),
  public.user_is_admin(uuid),
  public.reserve_dispatch_call(text)
  to service_role;

commit;