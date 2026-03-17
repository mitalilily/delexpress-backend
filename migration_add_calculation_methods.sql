-- ============================================================
-- Add Calculation Method Fields for Dual-Value Charges
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Add calculation method columns for dual-value charges
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS oda_method VARCHAR(20) DEFAULT 'whichever_is_higher',
  ADD COLUMN IF NOT EXISTS demurrage_method VARCHAR(20) DEFAULT 'whichever_is_higher',
  ADD COLUMN IF NOT EXISTS time_specific_method VARCHAR(20) DEFAULT 'whichever_is_higher',
  ADD COLUMN IF NOT EXISTS mall_delivery_method VARCHAR(20) DEFAULT 'whichever_is_higher',
  ADD COLUMN IF NOT EXISTS delivery_reattempt_method VARCHAR(20) DEFAULT 'whichever_is_higher';

-- Update existing records to have default method
UPDATE couriercart_b2b_additional_charges
SET 
  oda_method = COALESCE(oda_method, 'whichever_is_higher'),
  demurrage_method = COALESCE(demurrage_method, 'whichever_is_higher'),
  time_specific_method = COALESCE(time_specific_method, 'whichever_is_higher'),
  mall_delivery_method = COALESCE(mall_delivery_method, 'whichever_is_higher'),
  delivery_reattempt_method = COALESCE(delivery_reattempt_method, 'whichever_is_higher')
WHERE 
  oda_method IS NULL 
  OR demurrage_method IS NULL 
  OR time_specific_method IS NULL 
  OR mall_delivery_method IS NULL 
  OR delivery_reattempt_method IS NULL;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges'
-- AND column_name LIKE '%_method'
-- ORDER BY column_name;
-- ============================================================
