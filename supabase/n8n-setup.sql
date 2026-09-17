-- MiPortal: persistent news and private contact queue for local n8n.
create table if not exists public.news_articles (
 id uuid primary key default gen_random_uuid(),
 url text not null unique check (url ~ '^https://'),
 title text not null check (length(title) between 1 and 300),
 description text not null default '' check (length(description)<=1000),
 source text not null,
 published_at timestamptz not null,
 published boolean not null default true,
 fetched_at timestamptz not null default now()
);
alter table public.news_articles enable row level security;
revoke all on public.news_articles from anon, authenticated;
grant select on public.news_articles to anon, authenticated;
grant all on public.news_articles to service_role;
create policy "Read published news" on public.news_articles for select to anon,authenticated using(published);
create table if not exists public.contact_messages (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 100),
 email text not null check(length(email)<=254),
 message text not null check(length(message) between 10 and 5000),
 sender_hash text not null,
 created_at timestamptz not null default now(),
 notified_at timestamptz,
 lease_id uuid,
 lease_until timestamptz,
 attempts integer not null default 0
);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant all on public.contact_messages to service_role;
create index contact_sender_created on public.contact_messages(sender_hash,created_at);
create function public.enqueue_contact(p_name text,p_email text,p_message text,p_sender_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_sender_hash,0));
 if (select count(*) from public.contact_messages where sender_hash=p_sender_hash and created_at>now()-interval '1 hour')>=3 then
   raise exception 'RATE_LIMIT' using errcode='P0001';
 end if;
 insert into public.contact_messages(name,email,message,sender_hash) values(p_name,p_email,p_message,p_sender_hash) returning id into result;
 return result;
end; $$;
create function public.claim_contact() returns setof public.contact_messages
language sql security invoker set search_path='' as $$
 update public.contact_messages set lease_id=gen_random_uuid(),lease_until=now()+interval '15 minutes',attempts=attempts+1
 where id=(select id from public.contact_messages where notified_at is null
 and (lease_until is null or lease_until<now()) and attempts<5
 and (attempts=0 or created_at>now()-interval '12 hours')
 order by created_at for update skip locked limit 1) returning *;
$$;
create function public.complete_contact(p_id uuid,p_lease_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.contact_messages set notified_at=now(),lease_until=null
 where id=p_id and lease_id=p_lease_id and notified_at is null;
 return found;
end; $$;
revoke all on function public.enqueue_contact(text,text,text,text),public.claim_contact(),public.complete_contact(uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_contact(text,text,text,text),public.claim_contact(),public.complete_contact(uuid,uuid) to service_role;
