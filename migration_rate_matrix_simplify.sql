-- ============================================================
-- B2B Rate Matrix Simplification Migration
-- Remove: base_awb_price, min_charge, min_charge_weight, max_weight_limit
-- Keep: rate_per_kg (only field needed)
-- ============================================================
-- Table: couriercart_b2b_zone_to_zone_rates
-- ============================================================

-- Step 1: Drop old columns (ONLY after verifying data migration worked correctly)
-- WARNING: Backup your database before running these!

ALTER TABLE couriercart_b2b_zone_to_zone_rates
  DROP COLUMN IF EXISTS base_awb_price,
  DROP COLUMN IF EXISTS min_charge,
  DROP COLUMN IF EXISTS min_charge_weight,
  DROP COLUMN IF EXISTS max_weight_limit;

-- Step 2: Make rate_per_kg NOT NULL (since it's now the only required field)
-- Note: This will fail if there are existing NULL values. Handle those first if needed.
ALTER TABLE couriercart_b2b_zone_to_zone_rates
  ALTER COLUMN rate_per_kg SET NOT NULL;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_zone_to_zone_rates'
-- ORDER BY ordinal_position;
-- ============================================================
