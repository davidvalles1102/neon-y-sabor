-- ═══════════════════════════════════════════════════════════════════
-- staff_pins_schema.sql — Sistema de portales con PIN (Fase 2)
-- Ejecutar en: Supabase → SQL Editor → New Query → Run
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. TABLAS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_members (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name  text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('kitchen', 'delivery', 'waiter')),
  pin        text        NOT NULL UNIQUE,
  active     boolean     DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_events (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id   text        NOT NULL,
  event      text        NOT NULL,
  staff_id   uuid        REFERENCES public.staff_members ON DELETE SET NULL,
  metadata   jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ─── 2. RLS ─────────────────────────────────────────────────────────

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events  ENABLE ROW LEVEL SECURITY;

-- staff_members: solo admin puede leer/escribir
DROP POLICY IF EXISTS "staff_members_admin" ON public.staff_members;
CREATE POLICY "staff_members_admin"
  ON public.staff_members FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- order_events: cualquier usuario autenticado puede insertar y leer
DROP POLICY IF EXISTS "order_events_staff" ON public.order_events;
CREATE POLICY "order_events_staff"
  ON public.order_events FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── 3. RPCs (SECURITY DEFINER — bypassean RLS) ─────────────────────

-- verify_staff_pin: verifica PIN activo y devuelve datos del miembro
DROP FUNCTION IF EXISTS public.verify_staff_pin(text);
CREATE FUNCTION public.verify_staff_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_member public.staff_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member
  FROM public.staff_members
  WHERE pin = p_pin AND active = true;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.staff_members SET last_login = now() WHERE id = v_member.id;

  RETURN jsonb_build_object(
    'staff_id',  v_member.id,
    'full_name', v_member.full_name,
    'role',      v_member.role
  );
END;
$$;

-- get_role_credentials: devuelve email/password de la cuenta compartida del rol
-- ⚠️  Reemplaza los valores con los de las cuentas que crees en Supabase Auth
DROP FUNCTION IF EXISTS public.get_role_credentials(text);
CREATE FUNCTION public.get_role_credentials(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.staff_members
  WHERE pin = p_pin AND active = true;

  IF v_role IS NULL THEN RETURN NULL; END IF;

  RETURN CASE v_role
    WHEN 'kitchen'  THEN jsonb_build_object('email', 'cocina@crunchies.sv',   'password', 'Cocina2026##')
    WHEN 'delivery' THEN jsonb_build_object('email', 'delivery@crunchies.sv', 'password', 'Delivery2026##')
    WHEN 'waiter'   THEN jsonb_build_object('email', 'mesero@crunchies.sv',   'password', 'Mesero2026##')
    ELSE NULL
  END;
END;
$$;

-- Permitir llamar las RPCs sin sesión (los portales arrancan sin login)
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_role_credentials(text) TO anon, authenticated;

-- ─── 4. ÍNDICES ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_order_events_order_id  ON public.order_events (order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_staff_id  ON public.order_events (staff_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created   ON public.order_events (created_at DESC);

-- ─── 5. VERIFICACIÓN ────────────────────────────────────────────────

SELECT 'staff_members' AS tabla, COUNT(*) AS filas FROM public.staff_members
UNION ALL
SELECT 'order_events',           COUNT(*)           FROM public.order_events;

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('verify_staff_pin', 'get_role_credentials');
