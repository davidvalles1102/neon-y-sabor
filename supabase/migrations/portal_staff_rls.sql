-- ═══════════════════════════════════════════════════════════════════
-- Portal mesero: permitir que meseros actualicen estado de mesas
--
-- CONTEXTO: El portal ya tiene acceso a orders/order_items/payments
-- via las políticas orders_staff / order_items_staff / payments_staff
-- (schema.sql líneas 200-210) — que aplican cuando el perfil tiene
-- role='waiter'. El portal actualiza ese perfil en el login.
--
-- LO ÚNICO QUE FALTA es poder marcar la mesa como 'available' al cobrar.
-- La política existente "tables_customer_mark_occupied" solo permite
-- WITH CHECK (status = 'occupied'), bloqueando el cambio a 'available'.
--
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "portal_tables_update" ON public.restaurant_tables;
CREATE POLICY "portal_tables_update"
  ON public.restaurant_tables FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'waiter')
    )
  )
  WITH CHECK (true);

-- Verificación
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'restaurant_tables'
ORDER BY policyname;
