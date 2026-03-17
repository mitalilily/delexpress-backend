-- ============================================================
-- Add Green Tax column to B2B Additional Charges
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Add the green_tax column
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS green_tax NUMERIC(12, 2) DEFAULT '0';

-- Update existing records to have default value
UPDATE couriercart_b2b_additional_charges
SET green_tax = '0'
WHERE green_tax IS NULL;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges' 
-- AND column_name = 'green_tax';
-- ============================================================

