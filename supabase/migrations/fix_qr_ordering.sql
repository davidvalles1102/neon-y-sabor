-- ═══════════════════════════════════════════════════════════════════
-- Fix: pedido por QR desde mesa — columnas + RLS completo
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Es idempotente: seguro correrlo aunque ya esté aplicado.
-- ═══════════════════════════════════════════════════════════════════


-- ─── PASO 1: Columnas faltantes en orders ───────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in','takeout','delivery')),
  ADD COLUMN IF NOT EXISTS delivery_name    text,
  ADD COLUMN IF NOT EXISTS delivery_phone   text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS payment_method   text DEFAULT 'cash'
    CHECK (payment_method IN ('cash','nequi'));

-- ─── PASO 2: Corregir constraint de delivery_status ─────────────────
-- La migración original usaba 'assigned'/'in_transit'; la app usa
-- 'preparing'/'ready'/'on_the_way'. Esto reemplaza el constraint.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%delivery_status%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_status_new_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_new_check
    CHECK (delivery_status IN ('pending','preparing','ready','on_the_way','delivered') OR delivery_status IS NULL);


-- ─── PASO 3: RLS — mesas (anon + clientes autenticados) ─────────────
DROP POLICY IF EXISTS "tables_anon_read"           ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables_anon_occupied"       ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables_customer_read"       ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables_customer_mark_occupied" ON public.restaurant_tables;

CREATE POLICY "tables_anon_read"
  ON public.restaurant_tables FOR SELECT TO anon USING (true);

CREATE POLICY "tables_anon_occupied"
  ON public.restaurant_tables FOR UPDATE TO anon
  USING (true) WITH CHECK (status = 'occupied');

CREATE POLICY "tables_customer_read"
  ON public.restaurant_tables FOR SELECT TO authenticated USING (true);

CREATE POLICY "tables_customer_mark_occupied"
  ON public.restaurant_tables FOR UPDATE TO authenticated
  USING (true) WITH CHECK (status = 'occupied');


-- ─── PASO 4: RLS — órdenes (anon + clientes autenticados) ───────────
DROP POLICY IF EXISTS "orders_anon_insert"      ON public.orders;
DROP POLICY IF EXISTS "orders_anon_read"        ON public.orders;
DROP POLICY IF EXISTS "orders_customer_insert"  ON public.orders;
DROP POLICY IF EXISTS "orders_customer_own"     ON public.orders;

-- Anónimos: insertar con customer_id NULL
CREATE POLICY "orders_anon_insert"
  ON public.orders FOR INSERT TO anon
  WITH CHECK (customer_id IS NULL);

-- Anónimos: leer sus propias órdenes recientes para el tracker
CREATE POLICY "orders_anon_read"
  ON public.orders FOR SELECT TO anon
  USING (customer_id IS NULL AND created_at > NOW() - INTERVAL '24 hours');

-- Clientes logueados: insertar con su propio ID o sin ID
CREATE POLICY "orders_customer_insert"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() OR customer_id IS NULL);

-- Clientes logueados: ver sus propias órdenes
CREATE POLICY "orders_customer_own"
  ON public.orders FOR SELECT TO authenticated
  USING (customer_id = auth.uid());


-- ─── PASO 5: RLS — order_items (anon + clientes autenticados) ───────
DROP POLICY IF EXISTS "order_items_anon_insert"      ON public.order_items;
DROP POLICY IF EXISTS "order_items_customer_insert"  ON public.order_items;

-- Anónimos: insertar items a órdenes anónimas recientes
CREATE POLICY "order_items_anon_insert"
  ON public.order_items FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.customer_id IS NULL
        AND o.created_at > NOW() - INTERVAL '10 minutes'
    )
  );

-- Clientes logueados: insertar items a sus propias órdenes
CREATE POLICY "order_items_customer_insert"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.customer_id = auth.uid()
    )
  );


-- ─── PASO 6: RLS — menú (anon) ──────────────────────────────────────
DROP POLICY IF EXISTS "categories_anon_read" ON public.categories;
DROP POLICY IF EXISTS "menu_items_anon_read" ON public.menu_items;

CREATE POLICY "categories_anon_read"
  ON public.categories FOR SELECT TO anon USING (active = true);

CREATE POLICY "menu_items_anon_read"
  ON public.menu_items FOR SELECT TO anon USING (available = true);


-- ─── VERIFICACIÓN ────────────────────────────────────────────────────
SELECT
  tablename,
  policyname,
  roles::text,
  cmd
FROM pg_policies
WHERE tablename IN ('restaurant_tables','orders','order_items','categories','menu_items')
ORDER BY tablename, roles::text, cmd;
