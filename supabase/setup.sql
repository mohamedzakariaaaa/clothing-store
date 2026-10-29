-- SeefStore database setup. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Creates the products table, the photo storage, and the rules: everyone can VIEW,
-- only emails listed in "admins" can ADD / EDIT / DELETE.

-- 1) Who may use the dashboard
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;   -- no policies: nobody can read or change it from the website

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where email = lower(auth.jwt() ->> 'email'));
$$;

-- 2) Products
create table if not exists public.products (
  id          bigint generated always as identity primary key,
  name        text    not null check (char_length(name) between 1 and 80),
  price       integer not null check (price >= 0),
  category    text    not null default 'other',
  sizes       text[]  not null default '{}',
  colors      text[]  not null default '{}',
  description text    not null default '',
  in_stock    boolean not null default true,
  images      text[]  not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.products enable row level security;

drop policy if exists "Anyone can view products" on public.products;
create policy "Anyone can view products" on public.products
  for select using (true);

drop policy if exists "Admins can add products" on public.products;
create policy "Admins can add products" on public.products
  for insert to authenticated with check (public.is_admin());

drop policy if exists "Admins can edit products" on public.products;
create policy "Admins can edit products" on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete products" on public.products;
create policy "Admins can delete products" on public.products
  for delete to authenticated using (public.is_admin());

-- 3) Product photos (public to view, admins to upload / delete)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view product photos" on storage.objects;
create policy "Anyone can view product photos" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product photos" on storage.objects;
create policy "Admins can upload product photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can delete product photos" on storage.objects;
create policy "Admins can delete product photos" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- 4) Starter products (the current test items; delete them from the dashboard any time)
insert into public.products (name, price, category, sizes, colors, in_stock, images)
select * from (values
  ('Navy Wave Jacket',     1450, 'jackets', array['M','L','XL'],       array['كحلي','أبيض'],      true,  array['/images/products/navy-jacket.webp']),
  ('Retro Track Jacket',   1250, 'jackets', array['S','M','L'],        array['أوف وايت','أزرق'],  true,  array['/images/products/track-jacket.webp']),
  ('Wave Parachute Pants', 1650, 'pants',   array['M','L'],            array['أبيض','أزرق'],      false, array['/images/products/wave-pants.webp']),
  ('Court Shorts',          520, 'shorts',  array['M','L','XL','XXL'], array['زيتي'],             true,  array['/images/products/court-shorts.webp'])
) as seed(name, price, category, sizes, colors, in_stock, images)
where not exists (select 1 from public.products);

-- 5) Dashboard admins (lower case). Add more lines to give someone else access.
insert into public.admins (email) values ('seefstore@gmail.com')
on conflict (email) do nothing;
