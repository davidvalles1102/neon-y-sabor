-- ═══════════════════════════════════════════════════════════════════
-- RLS para staff_members
-- Permite al admin crear, ver, editar y eliminar miembros del staff
-- Las RPCs verify_staff_pin / get_role_credentials usan SECURITY DEFINER
-- y ya bypassean RLS — solo se necesita acceso para el panel admin
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_members_admin" ON public.staff_members;
CREATE POLICY "staff_members_admin"
  ON public.staff_members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Verificación
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'staff_members';
