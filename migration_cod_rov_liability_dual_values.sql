-- ============================================================
-- Update COD, ROV, and Liability to use dual values with methods
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Step 1: Add new dual-value fields for COD
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS cod_fixed_amount NUMERIC(12, 2) DEFAULT '50',
  ADD COLUMN IF NOT EXISTS cod_percentage NUMERIC(6, 2) DEFAULT '1',
  ADD COLUMN IF NOT EXISTS cod_method VARCHAR(20) DEFAULT 'whichever_is_higher';

-- Step 2: Add new dual-value fields for ROV
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS rov_fixed_amount NUMERIC(12, 2) DEFAULT '100',
  ADD COLUMN IF NOT EXISTS rov_percentage NUMERIC(6, 2) DEFAULT '0.5',
  ADD COLUMN IF NOT EXISTS rov_method VARCHAR(20) DEFAULT 'whichever_is_higher';

-- Step 3: Add new fields for Liability
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS liability_limit NUMERIC(12, 2) DEFAULT '5000',
  ADD COLUMN IF NOT EXISTS liability_method VARCHAR(20) DEFAULT 'whichever_is_lower';

-- Step 4: Migrate existing data (if any old values exist)
-- Note: Old cod_charge, rov_charge, liability_charge were calculated values, not stored
-- So we just set defaults

-- Step 5: Drop old columns (ONLY after verifying data migration worked correctly)
-- WARNING: Backup your database before running these!

ALTER TABLE couriercart_b2b_additional_charges
  DROP COLUMN IF EXISTS cod_charge,
  DROP COLUMN IF EXISTS rov_charge,
  DROP COLUMN IF EXISTS liability_charge;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges'
-- AND (column_name LIKE 'cod%' OR column_name LIKE 'rov%' OR column_name LIKE 'liability%')
-- ORDER BY column_name;
-- ============================================================
