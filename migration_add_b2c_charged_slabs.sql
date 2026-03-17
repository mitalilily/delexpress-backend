-- Add charged_slabs to b2c_orders for slab-based freight tracking
ALTER TABLE public.b2c_orders
ADD COLUMN IF NOT EXISTS charged_slabs numeric;
