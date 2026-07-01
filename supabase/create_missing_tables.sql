-- ============================================================
--  Crunchies — Schema fix completo para DB de producción
--  Seguro de ejecutar: todo usa IF NOT EXISTS / DROP IF EXISTS
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ─── 1. EXTENSIONES ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. PARCHAR TABLAS EXISTENTES ────────────────────────────

-- categories: agregar columnas que el código espera
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon          text    DEFAULT '🍽️';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS active        boolean DEFAULT true;

-- orders: columnas que el código usa pero no existen en la DB
-- (la DB tiene user_id; el código usa customer_id — agregamos customer_id)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id  uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes        text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal     numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax          numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at   timestamptz DEFAULT now();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS waiter_id    uuid;

-- order_items: columnas que el código usa pero no existen
-- (la DB tiene product_id/qty/price; el código usa menu_item_id/quantity/unit_price)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS menu_item_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quantity    integer;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price  numeric;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes       text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS status      text DEFAULT 'pending';
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

-- profiles: columnas que el código usa pero no existen
-- (la DB tiene name; el código usa full_name — agregamos full_name)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone          text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loyalty_points integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url     text;

-- delivery_zones: columnas que el código usa pero no existen
-- (la DB tiene delivery_price/available; el código usa fee/active)
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS fee           numeric DEFAULT 0;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS active        boolean DEFAULT true;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- ─── 3. CREAR TABLAS FALTANTES ────────────────────────────────

-- restaurant_tables debe crearse ANTES que orders.table_id y reservations
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id         uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  number     integer NOT NULL UNIQUE,
  capacity   integer NOT NULL DEFAULT 4,
  location   text DEFAULT 'Salón Principal'
               CHECK (location IN ('Zona VIP','Zona Fogata','Exterior','Salón Principal')),
  status     text DEFAULT 'available'
               CHECK (status IN ('available','occupied','reserved','maintenance')),
  created_at timestamptz DEFAULT now()
);

-- Ahora que restaurant_tables existe, agregar table_id a orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.restaurant_tables ON DELETE SET NULL;

-- menu_items
CREATE TABLE IF NOT EXISTS public.menu_items (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  category_id  text REFERENCES public.categories ON DELETE SET NULL,
  name         text NOT NULL,
  description  text,
  price        decimal(10,2) NOT NULL CHECK (price >= 0),
  image_url    text,
  available    boolean DEFAULT true,
  is_featured  boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- reservations
CREATE TABLE IF NOT EXISTS public.reservations (
  id               uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id      uuid REFERENCES public.profiles ON DELETE SET NULL,
  table_id         uuid REFERENCES public.restaurant_tables ON DELETE SET NULL,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  party_size       integer NOT NULL CHECK (party_size > 0),
  status           text DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','seated','cancelled','no_show')),
  notes            text,
  created_at       timestamptz DEFAULT now()
);

-- payments
CREATE TABLE IF NOT EXISTS public.payments (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id       text REFERENCES public.orders ON DELETE SET NULL,
  processed_by   uuid REFERENCES public.profiles ON DELETE SET NULL,
  amount         decimal(10,2) NOT NULL,
  method         text NOT NULL CHECK (method IN ('cash','card','transfer','points')),
  receipt_number text UNIQUE,
  change_amount  decimal(10,2) DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- loyalty_transactions
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id          uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id uuid REFERENCES public.profiles ON DELETE CASCADE NOT NULL,
  order_id    text REFERENCES public.orders ON DELETE SET NULL,
  points      integer NOT NULL,
  type        text CHECK (type IN ('earned','redeemed')),
  created_at  timestamptz DEFAULT now()
);

-- modifier_groups
CREATE TABLE IF NOT EXISTS public.modifier_groups (
  id             uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  name           text NOT NULL,
  selection_type text NOT NULL DEFAULT 'single'
                   CHECK (selection_type IN ('single','multiple')),
  required       boolean DEFAULT false,
  max_select     integer,
  display_order  integer DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- modifier_options
CREATE TABLE IF NOT EXISTS public.modifier_options (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  group_id      uuid REFERENCES public.modifier_groups ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  price_delta   decimal(10,2) NOT NULL DEFAULT 0,
  is_default    boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- menu_item_modifier_groups (junction)
CREATE TABLE IF NOT EXISTS public.menu_item_modifier_groups (
  menu_item_id      uuid REFERENCES public.menu_items ON DELETE CASCADE NOT NULL,
  modifier_group_id uuid REFERENCES public.modifier_groups ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- order_item_modifiers
CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
  id            uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_item_id uuid REFERENCES public.order_items ON DELETE CASCADE NOT NULL,
  option_name   text NOT NULL,
  price_delta   decimal(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id           uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  description  text NOT NULL,
  amount       decimal(10,2) NOT NULL CHECK (amount > 0),
  category     text NOT NULL DEFAULT 'otros'
                 CHECK (category IN ('insumos','servicios','nomina','renta','mantenimiento','marketing','transporte','otros')),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes        text,
  recurring    boolean DEFAULT false,
  recurrence   text CHECK (recurrence IN ('daily','weekly','monthly')),
  created_by   uuid REFERENCES public.profiles ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

-- ─── 4. RLS EN TABLAS NUEVAS ─────────────────────────────────
ALTER TABLE public.menu_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_options          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_modifiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses                  ENABLE ROW LEVEL SECURITY;

-- ─── 5. POLÍTICAS RLS ─────────────────────────────────────────

-- menu_items: lectura pública, escritura admin
DROP POLICY IF EXISTS "menu_read_all"    ON public.menu_items;
DROP POLICY IF EXISTS "menu_admin_write" ON public.menu_items;
CREATE POLICY "menu_read_all"    ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "menu_admin_write" ON public.menu_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- restaurant_tables: lectura pública, escritura staff
DROP POLICY IF EXISTS "tables_read_all"    ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables_staff_write" ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables_anon_update" ON public.restaurant_tables;
CREATE POLICY "tables_read_all"    ON public.restaurant_tables FOR SELECT USING (true);
CREATE POLICY "tables_staff_write" ON public.restaurant_tables FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter')));
CREATE POLICY "tables_anon_update" ON public.restaurant_tables FOR UPDATE TO anon
  USING (true) WITH CHECK (status = 'occupied');

-- reservations
DROP POLICY IF EXISTS "reserv_customer_own"    ON public.reservations;
DROP POLICY IF EXISTS "reserv_customer_insert" ON public.reservations;
DROP POLICY IF EXISTS "reserv_staff_all"       ON public.reservations;
CREATE POLICY "reserv_customer_own"    ON public.reservations FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "reserv_customer_insert" ON public.reservations FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "reserv_staff_all"       ON public.reservations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter')));

-- payments: solo staff
DROP POLICY IF EXISTS "payments_staff" ON public.payments;
CREATE POLICY "payments_staff" ON public.payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter')));

-- loyalty_transactions
DROP POLICY IF EXISTS "loyalty_own"   ON public.loyalty_transactions;
DROP POLICY IF EXISTS "loyalty_admin" ON public.loyalty_transactions;
CREATE POLICY "loyalty_own"   ON public.loyalty_transactions FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "loyalty_admin" ON public.loyalty_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- modifier_groups / options / junction: lectura pública, escritura admin
DROP POLICY IF EXISTS "mod_groups_read"  ON public.modifier_groups;
DROP POLICY IF EXISTS "mod_groups_admin" ON public.modifier_groups;
DROP POLICY IF EXISTS "mod_opts_read"    ON public.modifier_options;
DROP POLICY IF EXISTS "mod_opts_admin"   ON public.modifier_options;
DROP POLICY IF EXISTS "mod_junction_read"  ON public.menu_item_modifier_groups;
DROP POLICY IF EXISTS "mod_junction_admin" ON public.menu_item_modifier_groups;
CREATE POLICY "mod_groups_read"    ON public.modifier_groups FOR SELECT USING (true);
CREATE POLICY "mod_groups_admin"   ON public.modifier_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "mod_opts_read"      ON public.modifier_options FOR SELECT USING (true);
CREATE POLICY "mod_opts_admin"     ON public.modifier_options FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "mod_junction_read"  ON public.menu_item_modifier_groups FOR SELECT USING (true);
CREATE POLICY "mod_junction_admin" ON public.menu_item_modifier_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- order_item_modifiers: staff puede todo, anon puede insertar
DROP POLICY IF EXISTS "oim_staff"  ON public.order_item_modifiers;
DROP POLICY IF EXISTS "oim_anon"   ON public.order_item_modifiers;
CREATE POLICY "oim_staff" ON public.order_item_modifiers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','waiter','kitchen')));
CREATE POLICY "oim_anon"  ON public.order_item_modifiers FOR INSERT TO anon WITH CHECK (true);

-- expenses: solo admin
DROP POLICY IF EXISTS "expenses_admin" ON public.expenses;
CREATE POLICY "expenses_admin" ON public.expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── 6. VERIFICACIÓN ─────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
