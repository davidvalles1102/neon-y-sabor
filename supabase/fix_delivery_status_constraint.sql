-- ============================================================
--  FASE 1 FIX — Columnas de delivery + CHECK CONSTRAINT correcto
--
--  Combina add_order_columns.sql con el constraint corregido.
--  Seguro de ejecutar aunque ya existan algunas columnas (IF NOT EXISTS).
--
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- PASO 1: Agregar columnas de delivery si no existen
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type       text DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in','takeout','delivery')),
  ADD COLUMN IF NOT EXISTS delivery_name    text,
  ADD COLUMN IF NOT EXISTS delivery_phone   text,
  ADD COLUMN IF NOT EXISTS delivery_address text;

-- PASO 2: Agregar delivery_status SIN constraint todavía
--         (necesario porque el constraint lo ponemos en el paso 4)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_status text;

-- PASO 3: Eliminar cualquier constraint incorrecto que pueda existir
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_status_check;

-- PASO 4: Agregar el constraint con los valores correctos que usa el código JS
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_check
  CHECK (
    delivery_status IN ('pending', 'preparing', 'ready', 'on_the_way', 'delivered')
    OR delivery_status IS NULL
  );

-- PASO 5: Verificación — debe mostrar el constraint recién creado
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'orders'::regclass
  AND conname LIKE '%delivery_status%';

-- PASO 6: Confirmar que las columnas existen
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('order_type','delivery_name','delivery_phone','delivery_address','delivery_status')
ORDER BY column_name;
