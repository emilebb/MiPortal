-- Prepare/review in isolation. Applying to production requires owner approval.
begin;
alter table public.payments
  add column if not exists status text not null default 'approved' check (status in ('approved', 'revoked')),
  add column if not exists approved_at timestamptz,
  add column if not exists provider_updated_at timestamptz;
update public.payments set approved_at = created_at where approved_at is null;
update public.payments set provider_updated_at = approved_at where provider_updated_at is null;
alter table public.payments alter column approved_at set not null;
alter table public.payments alter column provider_updated_at set not null;

create table if not exists public.pro_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (expires_at >= started_at)
);
alter table public.pro_subscriptions enable row level security;
revoke all on public.pro_subscriptions from public, anon, authenticated;
grant select on public.pro_subscriptions to authenticated;
drop policy if exists own_subscription on public.pro_subscriptions;
create policy own_subscription on public.pro_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create index if not exists payments_user_approval on public.payments(user_id, approved_at);

-- Private helper called only by the service RPC, serialized by user lock.
create schema if not exists private;
create or replace function private.rebuild_pro_subscription(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare item record; period_start timestamptz; period_end timestamptz;
begin
  for item in select approved_at from public.payments
    where user_id = p_user_id and status = 'approved'
    order by approved_at, mp_payment_id
  loop
    if period_end is null or item.approved_at > period_end then
      period_start := item.approved_at;
      period_end := item.approved_at + interval '1 year';
    else
      period_end := period_end + interval '1 year';
    end if;
  end loop;
  if period_end is null then
    delete from public.pro_subscriptions where user_id = p_user_id;
  else
    insert into public.pro_subscriptions(user_id, started_at, expires_at)
      values (p_user_id, period_start, period_end)
      on conflict (user_id) do update set started_at = excluded.started_at,
        expires_at = excluded.expires_at, updated_at = now();
  end if;
end; $$;
revoke all on function private.rebuild_pro_subscription(uuid) from public, anon, authenticated;

create or replace function public.record_pro_payment_event(
  p_user_id uuid, p_payment_id text, p_amount numeric, p_currency text,
  p_status text, p_approved_at timestamptz, p_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.payments%rowtype;
begin
  if p_user_id is null or p_payment_id is null or p_payment_id !~ '^[0-9]{1,30}$'
    or p_amount is distinct from 19999::numeric or p_currency is distinct from 'COP'
    or p_status is null or p_status not in ('approved', 'revoked')
    or p_approved_at is null or p_updated_at is null
    or p_updated_at < p_approved_at then raise exception 'INVALID_PAYMENT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro-user:' || p_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pro-payment:' || p_payment_id, 0));
  select * into existing from public.payments where mp_payment_id = p_payment_id;
  if found then
    if existing.user_id <> p_user_id or existing.amount <> p_amount
      or existing.currency <> p_currency then raise exception 'PAYMENT_OWNER_MISMATCH'; end if;
    -- A replay cannot extend time or undo a refund/chargeback.
    if p_updated_at <= existing.provider_updated_at or existing.status = 'revoked' then
      return jsonb_build_object('payment_registered', true, 'duplicate', true);
    end if;
    update public.payments set status = p_status, provider_updated_at = p_updated_at
      where mp_payment_id = p_payment_id;
  else
    insert into public.payments(user_id, mp_payment_id, amount, currency, status, approved_at, provider_updated_at)
      values (p_user_id, p_payment_id, p_amount, p_currency, p_status, p_approved_at, p_updated_at);
  end if;
  perform private.rebuild_pro_subscription(p_user_id);
  return jsonb_build_object('payment_registered', true, 'duplicate', false);
end; $$;
revoke all on function public.record_pro_payment_event(uuid,text,numeric,text,text,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_pro_payment_event(uuid,text,numeric,text,text,timestamptz,timestamptz) to service_role;

-- Retire the unsafe old writer: deployment must switch to the new RPC.
create or replace function public.record_pro_payment(p_user_id uuid, p_payment_id text, p_amount numeric, p_currency text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin raise exception 'PAYMENT_API_UPGRADE_REQUIRED'; end; $$;
revoke all on function public.record_pro_payment(uuid,text,numeric,text) from public, anon, authenticated, service_role;

create or replace function public.has_active_pro()
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.pro_subscriptions where user_id = (select auth.uid())
    and started_at <= now() and expires_at > now());
$$;
revoke all on function public.has_active_pro() from public, anon;
grant execute on function public.has_active_pro() to authenticated;

-- Never invent an annual grant for a legacy role with no payment history.
do $$ declare uid uuid; begin
  if exists(select 1 from public.profiles p where role = 'pro' and not exists(
    select 1 from public.payments pay where pay.user_id = p.id)) then
    raise exception 'RECONCILE_LEGACY_PRO_BEFORE_MIGRATION';
  end if;
  for uid in select distinct user_id from public.payments loop
    perform private.rebuild_pro_subscription(uid);
  end loop;
end; $$;
-- Existing admins are untouched; purchase rights now live in a separate table.
update public.profiles set role = 'viewer' where role = 'pro';
commit;
