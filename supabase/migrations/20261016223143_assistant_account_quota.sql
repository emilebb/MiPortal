begin;
create schema if not exists private;
create table if not exists private.assistant_requests (
  id bigint generated always as identity primary key,
  subject_key text not null,
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.assistant_requests enable row level security;
revoke all on private.assistant_requests from public, anon, authenticated;
revoke all on sequence private.assistant_requests_id_seq from public, anon, authenticated;
create index if not exists assistant_subject_time on private.assistant_requests(subject_key, created_at);
create index if not exists assistant_ip_time on private.assistant_requests(ip_hash, created_at);
create index if not exists assistant_expiry on private.assistant_requests(created_at);

create or replace function public.reserve_assistant_request(p_user_id uuid, p_session_hash text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare subject text; checked_at timestamptz; quota record; retry integer := 0; count_in_window integer; oldest timestamptz;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_HASH'; end if;
  if p_user_id is not null then
    if not exists(select 1 from auth.users where id = p_user_id) then raise exception 'INVALID_USER'; end if;
    subject := 'user:' || p_user_id::text;
  elsif p_session_hash is not null and p_session_hash ~ '^[a-f0-9]{64}$' then
    subject := 'guest:' || p_session_hash;
  else raise exception 'INVALID_SESSION'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-ip:' || p_ip_hash, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-subject:' || subject, 0));
  checked_at := clock_timestamp();
  delete from private.assistant_requests where created_at <= checked_at - interval '24 hours';
  for quota in select * from (values
    (true, interval '1 minute', 5), (true, interval '1 hour', 20),
    (true, interval '24 hours', 40), (false, interval '24 hours', 5)
  ) as limits(by_ip, duration, ceiling)
  loop
    select count(*), min(created_at) into count_in_window, oldest from private.assistant_requests
      where created_at > checked_at - quota.duration
      and case when quota.by_ip then ip_hash = p_ip_hash else subject_key = subject end;
    if count_in_window >= quota.ceiling then
      retry := greatest(retry, ceil(extract(epoch from oldest + quota.duration - checked_at))::integer, 1);
    end if;
  end loop;
  if retry > 0 then return jsonb_build_object('allowed', false, 'retry_after', retry); end if;
  insert into private.assistant_requests(subject_key, ip_hash, created_at) values(subject, p_ip_hash, checked_at);
  return jsonb_build_object('allowed', true);
end; $$;
revoke all on function public.reserve_assistant_request(uuid,text,text) from public, anon, authenticated;
grant execute on function public.reserve_assistant_request(uuid,text,text) to service_role;
commit;
