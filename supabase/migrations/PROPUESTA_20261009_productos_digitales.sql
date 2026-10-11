-- PROPUESTA FINAL, NO APLICADA.
-- Requiere autorización explícita antes de cualquier ejecución en Supabase.
-- Crea exclusivamente objetos digital_* y dos buckets nuevos: uno privado de
-- archivos pagados y otro público limitado a imágenes de portada.
-- No inserta productos ni precios y no cambia resources, profiles, payments,
-- MiPortal Pro, usuarios, datos existentes ni buckets existentes.
-- Revisar Storage, RLS y las funciones con el responsable antes de aplicar.

begin;

create table public.digital_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  category text not null check (char_length(trim(category)) between 1 and 80),
  price numeric(12,2) not null check (price >= 0 and price <> 'NaN'::numeric),
  currency text not null default 'COP' check (currency = 'COP'),
  image_url text check (image_url is null or image_url ~* '^https://[^[:space:]]+$'),
  featured boolean not null default false,
  is_new boolean not null default false,
  is_free boolean not null default false,
  features text[] not null default '{}',
  technologies text[] not null default '{}',
  version text check (version is null or char_length(trim(version)) between 1 and 80),
  requirements text[] not null default '{}',
  license text check (license is null or char_length(trim(license)) between 1 and 160),
  gallery_urls text[] not null default '{}',
  related_product_ids uuid[] not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_products_free_price_check check (is_free = (price = 0))
);
create index digital_products_public_sort_idx
  on public.digital_products (published, featured desc, created_at desc);
create index digital_products_category_idx on public.digital_products (category);

create table public.digital_product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.digital_products(id) on delete restrict,
  storage_path text not null unique check (
    storage_path ~ ('^' || product_id::text || '/[A-Za-z0-9_.-]+$') and storage_path !~ '\.\.'
  ),
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 180),
  content_type text not null check (content_type in (
    'application/zip','application/x-zip-compressed','application/pdf','application/epub+zip',
    'application/json','application/octet-stream','text/plain','text/markdown','text/html',
    'text/css','text/javascript','application/javascript'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index digital_product_files_product_idx
  on public.digital_product_files (product_id, active, created_at desc);

create table public.digital_product_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  currency text not null default 'COP' check (currency = 'COP'),
  total numeric(12,2) not null check (total >= 0 and total <> 'NaN'::numeric),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  provider text check (provider is null or provider = 'mercadopago'),
  provider_preference_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (id, user_id),
  check (status <> 'paid' or paid_at is not null)
);
create index digital_product_orders_user_idx
  on public.digital_product_orders (user_id, created_at desc);
create index digital_product_orders_status_idx
  on public.digital_product_orders (status, created_at desc);

create table public.digital_product_order_items (
  order_id uuid not null references public.digital_product_orders(id) on delete restrict,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
  quantity integer not null default 1 check (quantity = 1),
  primary key (order_id, product_id)
);
create index digital_product_order_items_product_idx
  on public.digital_product_order_items (product_id);

create table public.digital_product_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.digital_product_orders(id) on delete restrict,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_payment_id text not null unique check (provider_payment_id ~ '^[0-9]{1,32}$'),
  status text not null check (status in ('approved','pending','rejected','cancelled','refunded','charged_back','chargeback_won')),
  amount numeric(12,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  currency text not null check (currency = 'COP'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index digital_product_payments_order_idx
  on public.digital_product_payments (order_id, created_at desc);

create table public.digital_product_download_grants (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.digital_product_orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  storage_path text not null,
  original_filename text not null,
  created_at timestamptz not null default now(),
  unique (order_id, storage_path),
  foreign key (order_id, user_id) references public.digital_product_orders(id, user_id) on delete restrict,
  foreign key (order_id, product_id) references public.digital_product_order_items(order_id, product_id) on delete restrict,
  foreign key (product_id, storage_path) references public.digital_product_files(product_id, storage_path) on delete restrict
);
create index digital_product_download_grants_user_idx
  on public.digital_product_download_grants (user_id, created_at desc);
create index digital_product_download_grants_order_user_idx
  on public.digital_product_download_grants (order_id, user_id);
create index digital_product_download_grants_order_product_idx
  on public.digital_product_download_grants (order_id, product_id);

create or replace function public.digital_products_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger digital_products_updated_at before update on public.digital_products
  for each row execute function public.digital_products_set_updated_at();
create trigger digital_product_files_updated_at before update on public.digital_product_files
  for each row execute function public.digital_products_set_updated_at();
create trigger digital_product_orders_updated_at before update on public.digital_product_orders
  for each row execute function public.digital_products_set_updated_at();
create trigger digital_product_payments_updated_at before update on public.digital_product_payments
  for each row execute function public.digital_products_set_updated_at();
revoke all on function public.digital_products_set_updated_at() from public, anon, authenticated, service_role;

-- Keep price/publication changes serialized with checkout without granting the
-- server role direct UPDATE privileges on product prices.
create or replace function public.digital_products_lock_checkout_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('digital-product:' || new.id::text, 0));
  return new;
end;
$$;
create trigger digital_products_lock_checkout_fields
  before update of price, published on public.digital_products
  for each row execute function public.digital_products_lock_checkout_fields();
revoke all on function public.digital_products_lock_checkout_fields() from public, anon, authenticated, service_role;

alter table public.digital_products enable row level security;
alter table public.digital_product_files enable row level security;
alter table public.digital_product_orders enable row level security;
alter table public.digital_product_order_items enable row level security;
alter table public.digital_product_payments enable row level security;
alter table public.digital_product_download_grants enable row level security;

-- Supabase projects can define permissive default table grants. Start from no
-- client access, then grant only the operations used below.
revoke all on table public.digital_products, public.digital_product_files,
  public.digital_product_orders, public.digital_product_order_items,
  public.digital_product_payments, public.digital_product_download_grants
  from public, anon, authenticated, service_role;

grant select on public.digital_products to anon, authenticated;
grant insert, update, delete on public.digital_products to authenticated;
grant select on public.digital_products to service_role;
create policy digital_products_public_read on public.digital_products
  for select to anon, authenticated using (published = true);
create policy digital_products_admin_read on public.digital_products
  for select to authenticated using ((select public.is_admin()));
create policy digital_products_admin_insert on public.digital_products
  for insert to authenticated with check ((select public.is_admin()));
create policy digital_products_admin_update on public.digital_products
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy digital_products_admin_delete on public.digital_products
  for delete to authenticated using ((select public.is_admin()));

grant select, insert, update on public.digital_product_files to authenticated;
grant select on public.digital_product_files to service_role;
create policy digital_product_files_admin_read on public.digital_product_files
  for select to authenticated using ((select public.is_admin()));
create policy digital_product_files_admin_insert on public.digital_product_files
  for insert to authenticated with check ((select public.is_admin()));
create policy digital_product_files_admin_update on public.digital_product_files
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select on public.digital_product_orders to authenticated;
grant select, insert, update on public.digital_product_orders to service_role;
create policy digital_product_orders_owner_read on public.digital_product_orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy digital_product_orders_admin_read on public.digital_product_orders
  for select to authenticated using ((select public.is_admin()));

grant select on public.digital_product_order_items to authenticated;
grant select, insert on public.digital_product_order_items to service_role;
create policy digital_product_order_items_owner_read on public.digital_product_order_items
  for select to authenticated using (exists (
    select 1 from public.digital_product_orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  ));
create policy digital_product_order_items_admin_read on public.digital_product_order_items
  for select to authenticated using ((select public.is_admin()));

revoke all on public.digital_product_payments from public, anon, authenticated;
grant select on public.digital_product_payments to authenticated;
grant select, insert, update on public.digital_product_payments to service_role;
create policy digital_product_payments_admin_read on public.digital_product_payments
  for select to authenticated using ((select public.is_admin()));
grant select on public.digital_product_download_grants to authenticated;
grant select, insert, delete on public.digital_product_download_grants to service_role;
create policy digital_product_download_grants_owner_read on public.digital_product_download_grants
  for select to authenticated using (user_id = (select auth.uid()));
create policy digital_product_download_grants_admin_read on public.digital_product_download_grants
  for select to authenticated using ((select public.is_admin()));

-- Cliente supplies only product ID + user-scoped idempotency key. Price, name,
-- user ID, and file rights are derived and written here from trusted rows.
create or replace function public.create_digital_product_order(
  p_product_id uuid, p_user_id uuid, p_idempotency_key text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_product public.digital_products%rowtype;
  v_order public.digital_product_orders%rowtype;
  v_existing_product uuid;
begin
  if p_product_id is null or p_user_id is null or p_idempotency_key is null or
     p_idempotency_key !~ '^[A-Za-z0-9_-]{16,80}$' then
    raise exception 'INVALID_ORDER_REQUEST';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select * into v_order from public.digital_product_orders
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    select product_id into v_existing_product from public.digital_product_order_items
      where order_id = v_order.id limit 1;
    if v_existing_product is distinct from p_product_id then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('order_id',v_order.id,'status',v_order.status,'total',v_order.total,
      'currency',v_order.currency,'provider_preference_id',v_order.provider_preference_id,
      'product_id',v_existing_product,
      'product_name',(select i.product_name from public.digital_product_order_items i where i.order_id=v_order.id limit 1));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('digital-product:' || p_product_id::text, 0));
  select * into v_product from public.digital_products
    where id = p_product_id and published = true;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if not exists (select 1 from public.digital_product_files f
    where f.product_id = v_product.id and f.active) then raise exception 'PRODUCT_FILE_NOT_AVAILABLE'; end if;
  insert into public.digital_product_orders(user_id,status,currency,total,idempotency_key,paid_at)
    values (p_user_id, case when v_product.price = 0 then 'paid' else 'pending' end,
      v_product.currency,v_product.price,p_idempotency_key,
      case when v_product.price = 0 then now() else null end)
    returning * into v_order;
  insert into public.digital_product_order_items(order_id,product_id,product_name,unit_price,quantity)
    values (v_order.id,v_product.id,v_product.name,v_product.price,1);
  if v_product.price = 0 then
    insert into public.digital_product_download_grants(order_id,user_id,product_id,storage_path,original_filename)
      select v_order.id,p_user_id,f.product_id,f.storage_path,f.original_filename
      from public.digital_product_files f where f.product_id=v_product.id and f.active
      on conflict (order_id,storage_path) do nothing;
  end if;
  return jsonb_build_object('order_id',v_order.id,'status',v_order.status,'total',v_order.total,
    'currency',v_order.currency,'product_id',v_product.id,'product_name',v_product.name);
end;
$$;
revoke all on function public.create_digital_product_order(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.create_digital_product_order(uuid,uuid,text) to service_role;

create or replace function public.set_digital_product_preference(p_order_id uuid,p_preference_id text)
returns boolean language plpgsql set search_path = '' as $$
begin
  if p_preference_id is null or p_preference_id = '' then return false; end if;
  update public.digital_product_orders set provider='mercadopago',provider_preference_id=p_preference_id
    where id=p_order_id and status='pending' and provider_preference_id is null;
  if found then return true; end if;
  return exists (select 1 from public.digital_product_orders
    where id=p_order_id and provider_preference_id=p_preference_id);
end;
$$;
revoke all on function public.set_digital_product_preference(uuid,text) from public, anon, authenticated;
grant execute on function public.set_digital_product_preference(uuid,text) to service_role;

-- Idempotent payment recording. The webhook must first verify the signature,
-- then fetch the payment from Mercado Pago. This function independently matches
-- order ID, amount and currency before granting downloads.
create or replace function public.record_digital_product_payment(
  p_order_id uuid,p_payment_id text,p_status text,p_amount numeric,p_currency text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_order public.digital_product_orders%rowtype;
  v_payment public.digital_product_payments%rowtype;
  v_other_approved boolean;
begin
  if p_order_id is null or p_payment_id is null or p_payment_id = '' or p_status is null or
     p_status not in ('approved','pending','rejected','cancelled','refunded','charged_back','chargeback_won') or
     p_amount is null or p_amount < 0 or p_currency is distinct from 'COP' then
    raise exception 'INVALID_PAYMENT_NOTIFICATION';
  end if;
  select * into v_order from public.digital_product_orders where id=p_order_id for update;
  if not found or v_order.total <> p_amount or v_order.currency <> p_currency then
    return jsonb_build_object('accepted',false);
  end if;
  select * into v_payment from public.digital_product_payments where provider_payment_id=p_payment_id;
  if found then
    if v_payment.order_id <> p_order_id or v_payment.amount <> p_amount or v_payment.currency <> p_currency then
      return jsonb_build_object('accepted',false);
    end if;
  end if;
  -- A stale approval for this same terminal payment must not undo a refund or
  -- chargeback. A distinct payment attempt may still settle this order later.
  if found and v_payment.status in ('refunded','charged_back') and p_status = 'approved' then
    return jsonb_build_object('accepted',false);
  end if;
  insert into public.digital_product_payments as existing (order_id,provider_payment_id,status,amount,currency)
    values (p_order_id,p_payment_id,p_status,p_amount,p_currency)
    on conflict(provider_payment_id) do update set
      status=case
        when existing.status = 'refunded' then existing.status
        when excluded.status = 'refunded' then excluded.status
        when existing.status = 'chargeback_won' and excluded.status <> 'refunded' then existing.status
        when excluded.status = 'chargeback_won' then excluded.status
        when existing.status = 'charged_back' then existing.status
        when excluded.status = 'charged_back' then excluded.status
        when existing.status = 'approved' then existing.status
        when excluded.status = 'approved' then excluded.status
        when existing.status in ('rejected','cancelled') then existing.status
        else excluded.status
      end,
      updated_at=now()
      where existing.order_id=excluded.order_id
        and existing.amount=excluded.amount
        and existing.currency=excluded.currency
    returning * into v_payment;
  if not found then return jsonb_build_object('accepted',false); end if;
  if v_payment.status in ('approved','chargeback_won') then
    update public.digital_product_orders set status='paid',paid_at=coalesce(paid_at,now()) where id=p_order_id;
    insert into public.digital_product_download_grants(order_id,user_id,product_id,storage_path,original_filename)
      select p_order_id,v_order.user_id,i.product_id,f.storage_path,f.original_filename
      from public.digital_product_order_items i
      join public.digital_product_files f on f.product_id=i.product_id and f.active
      where i.order_id=p_order_id
      on conflict(order_id,storage_path) do nothing;
  elsif v_payment.status in ('refunded','charged_back') then
    select exists (
      select 1 from public.digital_product_payments p
      where p.order_id=p_order_id and p.provider_payment_id<>p_payment_id
        and p.status in ('approved','chargeback_won')
    ) into v_other_approved;
    if v_other_approved then
      -- Another independently verified capture still covers the order.
      update public.digital_product_orders set status='paid' where id=p_order_id;
      insert into public.digital_product_download_grants(order_id,user_id,product_id,storage_path,original_filename)
        select p_order_id,v_order.user_id,i.product_id,f.storage_path,f.original_filename
        from public.digital_product_order_items i
        join public.digital_product_files f on f.product_id=i.product_id and f.active
        where i.order_id=p_order_id
        on conflict(order_id,storage_path) do nothing;
    else
      update public.digital_product_orders set status='refunded' where id=p_order_id;
      delete from public.digital_product_download_grants where order_id=p_order_id;
    end if;
  elsif v_order.status = 'pending' and v_payment.status in ('rejected','cancelled') then
    update public.digital_product_orders set status='cancelled' where id=p_order_id;
  end if;
  return jsonb_build_object('accepted',true,'order_status',
    (select status from public.digital_product_orders where id=p_order_id));
end;
$$;
revoke all on function public.record_digital_product_payment(uuid,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.record_digital_product_payment(uuid,text,text,numeric,text) to service_role;

-- This RPC is server-only. Caller still checks the authenticated user and
-- applies owner_id filter before requesting a signed URL.
create or replace function public.get_digital_download_grant(p_grant_id uuid,p_user_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',g.id,'storage_path',g.storage_path,
    'original_filename',g.original_filename,'product_id',g.product_id)
  from public.digital_product_download_grants g
  join public.digital_product_orders o on o.id=g.order_id and o.status='paid'
  where g.id=p_grant_id and g.user_id=p_user_id and o.user_id=p_user_id
$$;
revoke all on function public.get_digital_download_grant(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_digital_download_grant(uuid,uuid) to service_role;

-- A new private-only bucket. If this ID exists already, this statement fails
-- instead of changing its visibility or upload settings.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('miportal-digital-products','miportal-digital-products',false,52428800,
  array['application/zip','application/x-zip-compressed','application/pdf','application/epub+zip',
    'application/json','application/octet-stream','text/plain','text/markdown','text/html',
    'text/css','text/javascript','application/javascript']);

-- Solo imágenes de portada; este bucket separado es público. Nunca guardar aquí
-- ZIP, ebooks, código fuente ni otros archivos incluidos en una compra.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('miportal-product-images','miportal-product-images',true,5242880,
  array['image/png','image/jpeg','image/webp','image/avif']);

-- Public buckets serve reads without an objects SELECT policy. This bucket's
-- public URL is intentionally suitable only for non-sensitive product images.
create policy digital_product_images_admin_insert on storage.objects
  for insert to authenticated with check (
    bucket_id='miportal-product-images' and (select public.is_admin()) and
    name ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,190}$' and
    name !~ '\.\.'
  );
create policy digital_product_images_admin_update on storage.objects
  for update to authenticated using (
    bucket_id='miportal-product-images' and (select public.is_admin())
  ) with check (
    bucket_id='miportal-product-images' and (select public.is_admin()) and
    name ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,190}$' and
    name !~ '\.\.'
  );
create policy digital_product_images_admin_delete on storage.objects
  for delete to authenticated using (
    bucket_id='miportal-product-images' and (select public.is_admin())
  );

create policy digital_product_files_admin_upload on storage.objects
  for insert to authenticated with check (
    bucket_id='miportal-digital-products' and (select public.is_admin()) and
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,190}$' and
    name !~ '\.\.'
  );
create policy digital_product_files_admin_read on storage.objects
  for select to authenticated using (
    bucket_id='miportal-digital-products' and (select public.is_admin())
  );
create policy digital_product_files_admin_update on storage.objects
  for update to authenticated using (
    bucket_id='miportal-digital-products' and (select public.is_admin())
  ) with check (
    bucket_id='miportal-digital-products' and (select public.is_admin()) and
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,190}$' and
    name !~ '\.\.'
  );
-- Lets the admin UI remove a newly uploaded object if inserting its metadata
-- fails. Storage deletion remains unavailable to anon and non-admin users.
create policy digital_product_files_admin_delete on storage.objects
  for delete to authenticated using (
    bucket_id='miportal-digital-products' and (select public.is_admin()) and
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,190}$' and
    name !~ '\.\.'
  );
commit;
