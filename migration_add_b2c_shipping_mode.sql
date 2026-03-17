ALTER TABLE b2c_orders
ADD COLUMN IF NOT EXISTS shipping_mode varchar(50);
