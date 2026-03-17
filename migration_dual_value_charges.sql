-- ============================================================
-- B2B Dual-Value Charges Migration
-- Add fields for storing both values in dual-value charges
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Step 1: Add new dual-value fields
ALTER TABLE couriercart_b2b_additional_charges
  ADD COLUMN IF NOT EXISTS minimum_chargeable_weight NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS demurrage_per_awb_day NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS demurrage_per_kg_day NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS time_specific_per_kg NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS time_specific_per_awb NUMERIC(12, 2) DEFAULT '500',
  ADD COLUMN IF NOT EXISTS mall_delivery_per_kg NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS mall_delivery_per_awb NUMERIC(12, 2) DEFAULT '500',
  ADD COLUMN IF NOT EXISTS delivery_reattempt_per_kg NUMERIC(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS delivery_reattempt_per_awb NUMERIC(12, 2) DEFAULT '500';

-- Step 2: Migrate existing data (if any)
-- Migrate demurrage_charges to demurrage_per_awb_day if demurrage_method was 'per_awb_day'
UPDATE couriercart_b2b_additional_charges
SET demurrage_per_awb_day = COALESCE(demurrage_charges, '0')
WHERE demurrage_method = 'per_awb_day' OR demurrage_method IS NULL;

-- Migrate time_specific_delivery_charge to time_specific_per_kg
UPDATE couriercart_b2b_additional_charges
SET time_specific_per_kg = COALESCE(time_specific_delivery_charge, '0'),
    time_specific_per_awb = '500'
WHERE time_specific_delivery_charge IS NOT NULL;

-- Migrate mall_delivery_charge to mall_delivery_per_kg
UPDATE couriercart_b2b_additional_charges
SET mall_delivery_per_kg = COALESCE(mall_delivery_charge, '0'),
    mall_delivery_per_awb = '500'
WHERE mall_delivery_charge IS NOT NULL;

-- Migrate delivery_reattempt_charge to delivery_reattempt_per_kg
UPDATE couriercart_b2b_additional_charges
SET delivery_reattempt_per_kg = COALESCE(delivery_reattempt_charge, '0'),
    delivery_reattempt_per_awb = '500'
WHERE delivery_reattempt_charge IS NOT NULL;

-- Step 3: Drop old columns (ONLY after verifying data migration worked correctly)
-- WARNING: Backup your database before running these!

ALTER TABLE couriercart_b2b_additional_charges
  DROP COLUMN IF EXISTS demurrage_charges,
  DROP COLUMN IF EXISTS demurrage_method,
  DROP COLUMN IF EXISTS time_specific_delivery_charge,
  DROP COLUMN IF EXISTS time_specific_method,
  DROP COLUMN IF EXISTS mall_delivery_charge,
  DROP COLUMN IF EXISTS mall_delivery_method,
  DROP COLUMN IF EXISTS delivery_reattempt_charge,
  DROP COLUMN IF EXISTS delivery_reattempt_method;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges'
-- AND column_name LIKE '%demurrage%' OR column_name LIKE '%time_specific%' 
--   OR column_name LIKE '%mall_delivery%' OR column_name LIKE '%delivery_reattempt%'
-- ORDER BY column_name;
-- ============================================================
