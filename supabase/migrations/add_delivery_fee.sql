-- Agrega delivery_fee y pickup_staff_id a orders (idempotente)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL;
