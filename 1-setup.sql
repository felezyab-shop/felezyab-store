-- فروشگاه فلزیاب: ساخت جدول‌ها، قفل‌های امنیتی (RLS) و توابع سفارش
-- چند بار اجرا کردنش بی‌خطر است. اگر جدول‌ها از قبل هست، داده‌ها پاک نمی‌شود.
-- ترتیب: ۱) این فایل   ۲) فایل 2-admin.sql (بعد از ساخت کاربر مدیر)

create extension if not exists pgcrypto;

-- ───────── جدول‌ها ─────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  model text not null default '' check (char_length(model) <= 80),
  price bigint not null check (price >= 0 and price <= 100000000000),          -- تومان
  old_price bigint check (old_price is null or old_price > price),             -- قیمت قبلی (برای نمایش تخفیف)
  stock int not null default 0 check (stock >= 0),
  images text[] not null default '{}' check (cardinality(images) <= 8),
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 40),
  short_text text not null default '' check (char_length(short_text) <= 300),
  description text not null default '' check (char_length(description) <= 8000),
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_desc text not null default '' check (char_length(seo_desc) <= 300),
  featured boolean not null default false,
  bestseller boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_active_idx on public.products(active, sort);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'hero' check (kind in ('hero','occasion')),
  title text not null check (char_length(title) between 1 and 120),
  subtitle text not null default '' check (char_length(subtitle) <= 240),
  image text not null default '' check (char_length(image) <= 500),
  link text not null default '' check (char_length(link) <= 300),
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 160),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  body text not null default '' check (char_length(body) <= 20000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pages (
  slug text primary key check (slug in ('about','contact','guide','terms')),
  title text not null,
  body text not null default '' check (char_length(body) <= 20000)
);

create table if not exists public.settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value text not null default '' check (char_length(value) <= 500)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text not null,
  city text not null,
  address text not null,
  note text not null default '',
  method text not null check (method in ('contact','online')),
  status text not null default 'new' check (status in ('new','confirmed','preparing','shipped','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','failed')),
  total bigint not null check (total >= 0),
  authority text unique,
  ref_id text,
  paid_at timestamptz,
  admin_note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists orders_phone_idx on public.orders(phone, created_at);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  price bigint not null,
  qty int not null check (qty between 1 and 10)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.track_log (phone text not null, at timestamptz not null default now());
create index if not exists track_log_idx on public.track_log(phone, at);

-- ───────── تابع کمکی: مدیر بودن ─────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as
$$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- تاریخ ویرایش محصول
create or replace function public.touch_updated() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated();

-- ───────── قفل‌ها (RLS) ─────────
alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.banners enable row level security;
alter table public.articles enable row level security;
alter table public.pages enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.track_log enable row level security;

-- ابتدا همه‌ی دسترسی‌های عمومی را می‌بندیم، بعد فقط آنچه لازم است را باز می‌کنیم
revoke all on all tables in schema public from anon, authenticated;
grant select on public.categories, public.products, public.banners, public.articles, public.pages, public.settings to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.banners, public.articles, public.pages, public.settings to authenticated;
grant select, update, delete on public.orders, public.order_items to authenticated;
grant select on public.admins to authenticated;

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['categories','products','banners','articles'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (active or public.is_admin())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
  foreach t in array array['pages','settings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
  foreach t in array array['orders','order_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;
-- track_log: هیچ سیاستی ندارد، یعنی فقط توابع سروری به آن دسترسی دارند.

-- ───────── ثبت سفارش (فقط از این تابع؛ قیمت‌ها از پایگاه داده خوانده می‌شود، نه از مرورگر) ─────────
create or replace function public.place_order(
  p_name text, p_phone text, p_city text, p_address text, p_note text, p_items jsonb, p_method text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare
  v_phone text; v_name text := btrim(coalesce(p_name,'')); v_city text := btrim(coalesce(p_city,''));
  v_addr text := btrim(coalesce(p_address,'')); v_note text := btrim(coalesce(p_note,''));
  v_item jsonb; v_id uuid; v_qty int; v_p public.products%rowtype;
  v_total bigint := 0; v_code text; v_oid uuid; v_try int := 0;
  v_lines jsonb := '[]'::jsonb; v_ids uuid[] := '{}';
begin
  -- رقم‌های فارسی و عربی → انگلیسی
  v_phone := translate(btrim(coalesce(p_phone,'')), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  if v_phone !~ '^09[0-9]{9}$' then raise exception 'bad_phone'; end if;
  if char_length(v_name) < 3 or char_length(v_name) > 80 then raise exception 'bad_name'; end if;
  if char_length(v_city) < 2 or char_length(v_city) > 60 then raise exception 'bad_city'; end if;
  if char_length(v_addr) < 10 or char_length(v_addr) > 400 then raise exception 'bad_address'; end if;
  if char_length(v_note) > 400 then raise exception 'bad_note'; end if;
  if p_method not in ('contact','online') then raise exception 'bad_method'; end if;
  if p_method = 'online' and coalesce((select value from public.settings where key = 'online_payment'), 'off') <> 'on' then
    raise exception 'online_disabled';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'bad_items';
  end if;
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_orders';
  end if;

  -- شناسه‌ها را بررسی می‌کنیم و محصولات را به ترتیب شناسه قفل می‌کنیم تا دو سفارش همزمان موجودی را خراب نکنند
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin v_id := (v_item->>'id')::uuid; exception when others then raise exception 'bad_items'; end;
    v_ids := v_ids || v_id;
  end loop;
  perform 1 from public.products where id = any(v_ids) order by id for update;

  for v_item in select * from jsonb_array_elements(p_items) loop
    begin v_id := (v_item->>'id')::uuid; v_qty := (v_item->>'qty')::int;
    exception when others then raise exception 'bad_items'; end;
    if v_qty is null or v_qty < 1 or v_qty > 10 then raise exception 'bad_items'; end if;
    select * into v_p from public.products where id = v_id and active;
    if not found then raise exception 'product_unavailable'; end if;
    if v_p.stock < v_qty then raise exception 'out_of_stock'; end if;
    v_total := v_total + v_p.price * v_qty;
    v_lines := v_lines || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'price', v_p.price, 'qty', v_qty);
  end loop;
  -- یک محصول دوبار در فهرست آمده باشد، مجموع تعداد هم باید از موجودی بیشتر نشود
  if exists (
    select 1 from (select l->>'id' as id, sum((l->>'qty')::int) q from jsonb_array_elements(v_lines) l group by 1) s
    join public.products p on p.id = s.id::uuid where p.stock < s.q
  ) then raise exception 'out_of_stock'; end if;

  loop
    v_code := 'F' || lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 100000000)::text, 8, '0');
    exit when not exists (select 1 from public.orders where code = v_code);
    v_try := v_try + 1; if v_try > 20 then raise exception 'server_busy'; end if;
  end loop;

  insert into public.orders(code, name, phone, city, address, note, method, total)
  values (v_code, v_name, v_phone, v_city, v_addr, v_note, p_method, v_total) returning id into v_oid;
  insert into public.order_items(order_id, product_id, name, price, qty)
  select v_oid, (l->>'id')::uuid, l->>'name', (l->>'price')::bigint, (l->>'qty')::int from jsonb_array_elements(v_lines) l;
  update public.products p set stock = p.stock - s.q
    from (select (l->>'id')::uuid as id, sum((l->>'qty')::int) as q from jsonb_array_elements(v_lines) l group by 1) s
   where p.id = s.id;

  return jsonb_build_object('code', v_code, 'total', v_total, 'method', p_method);
end $$;
revoke all on function public.place_order(text,text,text,text,text,jsonb,text) from public;
grant execute on function public.place_order(text,text,text,text,text,jsonb,text) to anon, authenticated;

-- ───────── پیگیری سفارش (کد سفارش + شماره موبایل هر دو لازم است) ─────────
create or replace function public.track_order(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_phone text; v_o public.orders%rowtype; v_items jsonb;
begin
  v_phone := translate(btrim(coalesce(p_phone,'')), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  if v_phone !~ '^09[0-9]{9}$' then raise exception 'bad_phone'; end if;
  delete from public.track_log where at < now() - interval '1 hour';
  if (select count(*) from public.track_log where phone = v_phone and at > now() - interval '10 minutes') >= 30 then
    raise exception 'too_many_attempts';
  end if;
  insert into public.track_log(phone) values (v_phone);
  select * into v_o from public.orders where code = upper(btrim(coalesce(p_code,''))) and phone = v_phone;
  if not found then return jsonb_build_object('error', 'not_found'); end if;   -- بدون raise، تا ثبت تلاش در track_log پس گرفته نشود
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'price', price) order by name), '[]'::jsonb)
    into v_items from public.order_items where order_id = v_o.id;
  return jsonb_build_object('code', v_o.code, 'status', v_o.status, 'payment_status', v_o.payment_status, 'method', v_o.method,
    'total', v_o.total, 'created_at', v_o.created_at, 'city', v_o.city, 'items', v_items);
end $$;
revoke all on function public.track_order(text,text) from public;
grant execute on function public.track_order(text,text) to anon, authenticated;

-- ───────── کارهای مدیر ─────────
create or replace function public.admin_set_order_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('new','confirmed','preparing','shipped','delivered','cancelled') then raise exception 'bad_status'; end if;
  select * into v_o from public.orders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if p_status = 'cancelled' then
    update public.products p set stock = p.stock + i.qty from public.order_items i where i.order_id = v_o.id and i.product_id = p.id;
  end if;
  update public.orders set status = p_status where id = p_id;
  return jsonb_build_object('status', p_status);
end $$;
revoke all on function public.admin_set_order_status(uuid,text) from public;
grant execute on function public.admin_set_order_status(uuid,text) to authenticated;

-- ثبت دریافت وجه به‌صورت دستی (برای سفارش‌هایی که با هماهنگی مستقیم پرداخت شده‌اند)
create or replace function public.admin_mark_paid(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into v_o from public.orders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if v_o.payment_status = 'paid' then return jsonb_build_object('payment_status', 'paid'); end if;
  if v_o.method = 'online' and v_o.payment_status = 'pending' then raise exception 'payment_pending'; end if;
  update public.orders set payment_status = 'paid', paid_at = now(), ref_id = coalesce(ref_id, 'manual') where id = p_id;
  return jsonb_build_object('payment_status', 'paid');
end $$;
revoke all on function public.admin_mark_paid(uuid) from public;
grant execute on function public.admin_mark_paid(uuid) to authenticated;

-- ───────── توابع پرداخت (فقط برای توابع Edge با service_role؛ مرورگر به آن‌ها دسترسی ندارد) ─────────
create or replace function public.order_pay_begin(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_phone text; v_o public.orders%rowtype;
begin
  v_phone := translate(btrim(coalesce(p_phone,'')), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  select * into v_o from public.orders where code = upper(btrim(coalesce(p_code,''))) and phone = v_phone for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.method <> 'online' or v_o.status = 'cancelled' then raise exception 'not_payable'; end if;
  if v_o.payment_status = 'paid' then raise exception 'already_paid'; end if;
  if coalesce((select value from public.settings where key = 'online_payment'), 'off') <> 'on' then raise exception 'online_disabled'; end if;
  update public.orders set payment_status = 'pending', authority = null where id = v_o.id;
  return jsonb_build_object('order_id', v_o.id, 'amount', v_o.total, 'code', v_o.code);
end $$;

create or replace function public.order_pay_set_authority(p_order uuid, p_authority text) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$ begin
  update public.orders set authority = p_authority where id = p_order and payment_status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.order_pay_abort(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as
$$ begin
  update public.orders set payment_status = 'unpaid', authority = null where id = p_order and payment_status = 'pending';
end $$;

create or replace function public.order_pay_lookup(p_authority text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as
$$ select to_jsonb(x) from (select code, total, payment_status from public.orders where authority = p_authority) x $$;

create or replace function public.order_pay_mark_paid(p_authority text, p_ref_id text, p_card_pan text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where authority = p_authority for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.payment_status = 'paid' then return jsonb_build_object('status', 'duplicate', 'code', v_o.code); end if;
  update public.orders set payment_status = 'paid', paid_at = now(), ref_id = left(coalesce(p_ref_id,''), 40) where id = v_o.id;
  return jsonb_build_object('status', 'ok', 'code', v_o.code);
end $$;

create or replace function public.order_pay_mark_failed(p_authority text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$$
declare v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where authority = p_authority for update;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  if v_o.payment_status = 'paid' then return jsonb_build_object('status', 'already_paid', 'code', v_o.code); end if;
  update public.orders set payment_status = 'failed' where id = v_o.id;
  return jsonb_build_object('status', 'failed', 'code', v_o.code);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'order_pay_begin(text,text)', 'order_pay_set_authority(uuid,text)', 'order_pay_abort(uuid,text)', 'order_pay_lookup(text)',
    'order_pay_mark_paid(text,text,text)', 'order_pay_mark_failed(text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ───────── مقدارهای اولیه (قابل ویرایش در پنل مدیریت) ─────────
insert into public.categories(slug, name, sort) values
  ('metal-detectors', 'دستگاه‌های فلزیاب', 1),
  ('accessories', 'لوازم جانبی', 2),
  ('batteries', 'باتری و شارژر', 3)
on conflict (slug) do nothing;

insert into public.settings(key, value) values
  ('shop_name', 'فروشگاه فلزیاب [نام فروشگاه]'),
  ('phone', ''), ('whatsapp', ''), ('address', ''), ('hours', ''),
  ('license_note', ''),
  ('online_payment', 'off')
on conflict (key) do nothing;

insert into public.pages(slug, title, body) values
  ('about', 'درباره ما', E'[نام فروشگاه] دستگاه‌های فلزیاب را مستقیم به مشتری عرضه می‌کند.\n\nاین متن را در پنل مدیریت (بخش «صفحه‌ها») با معرفی خودتان، سابقه و اطلاعات مجوز کسب‌وکار جایگزین کنید.'),
  ('contact', 'تماس با ما', E'تلفن، واتساپ و نشانی فروشگاه را در پنل مدیریت (بخش «تنظیمات») وارد کنید تا در همین صفحه نمایش داده شود.'),
  ('guide', 'راهنمای خرید', E'۱. محصول را از فروشگاه انتخاب کنید و به سبد خرید اضافه کنید.\n۲. در صفحه‌ی سبد، نام، شماره موبایل و نشانی را وارد کنید.\n۳. روش ثبت سفارش را انتخاب کنید: هماهنگی مستقیم با فروشنده یا پرداخت آنلاین (در صورت فعال بودن).\n۴. با کد سفارش و شماره موبایل می‌توانید وضعیت سفارش را در صفحه‌ی «پیگیری سفارش» ببینید.\n\nپیش از خرید، مشخصات فنی هر دستگاه را در صفحه‌ی همان محصول بخوانید.'),
  ('terms', 'قوانین و شرایط خرید', E'این متن نمونه است و باید پیش از انتشار با مشاور حقوقی شما بازبینی شود.\n\n۱. مسئولیت رعایت قوانین: خرید، نگهداری و استفاده از دستگاه‌های فلزیاب باید مطابق قوانین محل فعالیت و استفاده باشد. خریدار مسئول استفاده‌ی قانونی از دستگاه است.\n۲. اطلاعات محصول: مشخصات فنی همان است که در صفحه‌ی محصول آمده است. فروشگاه درباره‌ی نتیجه‌ی کار دستگاه در شرایط مختلف وعده نمی‌دهد.\n۳. قیمت‌ها: قیمت نهایی همان است که هنگام ثبت سفارش نمایش داده می‌شود.\n۴. ارسال و مرجوعی: [شرایط ارسال، گارانتی و مرجوعی خود را اینجا بنویسید].\n۵. حریم خصوصی: نام، شماره موبایل و نشانی فقط برای پردازش و ارسال سفارش استفاده می‌شود.')
on conflict (slug) do nothing;

-- ───────── تصاویر محصول (Storage) ─────────
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists product_images_admin_write on storage.objects;
create policy product_images_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin()) with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
