-- PROPUESTA NO APLICADA — esquema de productos digitales MiPortal.
-- EJECUCIÓN REQUIERE AUTORIZACIÓN EXPLÍCITA. No ejecutar desde despliegues,
-- automatizaciones o esta tarea. Revisar y adaptar políticas antes de autorizar.
-- Este archivo no inserta productos y no modifica resources, profiles ni payments.
-- Las escrituras de pedidos y derechos de descarga se reservan al backend
-- confiable (service_role); no se implementa ni activa checkout aquí.

begin;

create table public.digital_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  category text not null check (char_length(trim(category)) between 1 and 80),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'COP' check (currency = 'COP'),
  image_url text check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
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
  updated_at timestamptz not null default now()
);

create table public.digital_product_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  currency text not null default 'COP' check (currency = 'COP'),
  total numeric(12,2) not null check (total >= 0),
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.digital_product_order_items (
  order_id uuid not null references public.digital_product_orders(id) on delete restrict,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  primary key (order_id, product_id)
);

create table public.digital_product_download_grants (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.digital_product_orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.digital_products(id) on delete restrict,
  storage_path text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

alter table public.digital_products enable row level security;
alter table public.digital_product_orders enable row level security;
alter table public.digital_product_order_items enable row level security;
alter table public.digital_product_download_grants enable row level security;

grant select on public.digital_products to anon, authenticated;
create policy digital_products_public_read on public.digital_products
  for select to anon, authenticated using (published = true);

-- Lectura propia únicamente: ningún permiso/policy de escritura para clientes.
grant select on public.digital_product_orders to authenticated;
create policy digital_orders_owner_read on public.digital_product_orders
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.digital_product_order_items to authenticated;
create policy digital_order_items_owner_read on public.digital_product_order_items
  for select to authenticated using (exists (
    select 1 from public.digital_product_orders o
    where o.id = order_id and o.user_id = (select auth.uid())
  ));
grant select on public.digital_product_download_grants to authenticated;
create policy digital_download_grants_owner_read on public.digital_product_download_grants
  for select to authenticated using (user_id = (select auth.uid()));

-- Requiere bucket privado separado y entrega firmada por backend autorizado.
-- No publicar enlaces permanentes ni exponer service_role en el cliente.
-- No se crea bucket automáticamente en esta propuesta.

commit;
