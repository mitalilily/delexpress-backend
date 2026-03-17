-- ============================================================
-- Update Minimum Chargeable Method to use calculation method
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- First, alter the column to increase size from VARCHAR(10) to VARCHAR(20)
ALTER TABLE couriercart_b2b_additional_charges
  ALTER COLUMN minimum_chargeable_method TYPE VARCHAR(20);

-- Update existing 'rs' and 'kg' values to 'whichever_is_higher'
UPDATE couriercart_b2b_additional_charges
SET minimum_chargeable_method = 'whichever_is_higher'
WHERE minimum_chargeable_method IN ('rs', 'kg') OR minimum_chargeable_method IS NULL;

-- Set the default value
ALTER TABLE couriercart_b2b_additional_charges
  ALTER COLUMN minimum_chargeable_method SET DEFAULT 'whichever_is_higher';

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT minimum_chargeable_method, COUNT(*) 
-- FROM couriercart_b2b_additional_charges 
-- GROUP BY minimum_chargeable_method;
-- ============================================================
