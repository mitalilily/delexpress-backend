-- ============================================================
-- Add handling_single_piece column to B2B Additional Charges
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Add the handling_single_piece column
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS handling_single_piece NUMERIC(12, 2) DEFAULT '0';

-- Update existing records to have default value
UPDATE couriercart_b2b_additional_charges
SET handling_single_piece = '0'
WHERE handling_single_piece IS NULL;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges' 
-- AND column_name = 'handling_single_piece';
-- ============================================================
