CREATE TABLE IF NOT EXISTS shipping_rate_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_rate_id uuid NOT NULL REFERENCES shipping_rates(id) ON DELETE CASCADE,
  weight_from numeric(10,3) NOT NULL,
  weight_to numeric(10,3),
  rate numeric(10,2) NOT NULL,
  extra_rate numeric(10,2),
  extra_weight_unit numeric(10,3),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

ALTER TABLE shipping_rate_slabs
  ADD COLUMN IF NOT EXISTS extra_rate numeric(10,2);

ALTER TABLE shipping_rate_slabs
  ADD COLUMN IF NOT EXISTS extra_weight_unit numeric(10,3);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_slabs_rate_id
  ON shipping_rate_slabs (shipping_rate_id);

CREATE INDEX IF NOT EXISTS idx_shipping_rate_slabs_weight_range
  ON shipping_rate_slabs (shipping_rate_id, weight_from, weight_to);
