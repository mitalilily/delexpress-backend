-- ============================================================
-- B2B Overhead Charges Migration
-- Replace old "Extra Charges" with exact 20 overhead charge fields
-- ============================================================
-- Table: couriercart_b2b_additional_charges
-- ============================================================

-- Step 1: Add new columns
ALTER TABLE couriercart_b2b_additional_charges
  -- Rename awb_charge to awb_charges (if exists, otherwise add)
  ADD COLUMN IF NOT EXISTS awb_charges DECIMAL(12, 2) DEFAULT '0',
  
  -- Add minimum_chargeable_method enum
  ADD COLUMN IF NOT EXISTS minimum_chargeable_method VARCHAR(10) DEFAULT 'rs',
  
  -- Replace demurrage fields with new structure
  ADD COLUMN IF NOT EXISTS demurrage_charges DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS demurrage_method VARCHAR(20) DEFAULT 'per_awb_day',
  
  -- Rename holiday_pickup_charge to public_holiday_pickup_charge
  ADD COLUMN IF NOT EXISTS public_holiday_pickup_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Rename fuel_surcharge_percent to fuel_surcharge_percentage
  ADD COLUMN IF NOT EXISTS fuel_surcharge_percentage DECIMAL(6, 2) DEFAULT '0',
  
  -- Replace ODA fields with new structure
  ADD COLUMN IF NOT EXISTS oda_charges DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS oda_per_kg_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Rename csd_charge to csd_delivery_charge
  ADD COLUMN IF NOT EXISTS csd_delivery_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Replace time-specific fields with new structure
  ADD COLUMN IF NOT EXISTS time_specific_delivery_charge DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS time_specific_method VARCHAR(20) DEFAULT 'per_kg_or_500',
  
  -- Replace mall delivery fields with new structure
  ADD COLUMN IF NOT EXISTS mall_delivery_charge DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS mall_delivery_method VARCHAR(20) DEFAULT 'per_kg_or_500',
  
  -- Replace attempt charge fields with new structure
  ADD COLUMN IF NOT EXISTS delivery_reattempt_charge DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS delivery_reattempt_method VARCHAR(20) DEFAULT 'per_kg_or_500',
  
  -- Rename handling fields
  ADD COLUMN IF NOT EXISTS handling_below_100_kg DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS handling_100_to_200_kg DECIMAL(12, 2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS handling_above_200_kg DECIMAL(12, 2) DEFAULT '0',
  
  -- Replace insurance_percent with insurance_charge
  ADD COLUMN IF NOT EXISTS insurance_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Replace cod_flat/cod_percent with cod_charge
  ADD COLUMN IF NOT EXISTS cod_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Replace rov_flat/rov_percent with rov_charge
  ADD COLUMN IF NOT EXISTS rov_charge DECIMAL(12, 2) DEFAULT '0',
  
  -- Rename liability_limit to liability_charge
  ADD COLUMN IF NOT EXISTS liability_charge DECIMAL(12, 2) DEFAULT '0';

-- Step 2: Migrate data from old columns to new columns (if old columns exist)
-- Note: Run these only if you have existing data to migrate

-- Migrate awb_charge → awb_charges
UPDATE couriercart_b2b_additional_charges
SET awb_charges = COALESCE(awb_charge, '0')
WHERE awb_charge IS NOT NULL AND awb_charges = '0';

-- Migrate holiday_pickup_charge → public_holiday_pickup_charge
UPDATE couriercart_b2b_additional_charges
SET public_holiday_pickup_charge = COALESCE(holiday_pickup_charge, '0')
WHERE holiday_pickup_charge IS NOT NULL AND public_holiday_pickup_charge = '0';

-- Migrate fuel_surcharge_percent → fuel_surcharge_percentage
UPDATE couriercart_b2b_additional_charges
SET fuel_surcharge_percentage = COALESCE(fuel_surcharge_percent, '0')
WHERE fuel_surcharge_percent IS NOT NULL AND fuel_surcharge_percentage = '0';

-- Migrate ODA fields
UPDATE couriercart_b2b_additional_charges
SET 
  oda_charges = COALESCE(oda_charge_per_awb, '0'),
  oda_per_kg_charge = COALESCE(oda_charge_per_kg, '0')
WHERE (oda_charge_per_awb IS NOT NULL OR oda_charge_per_kg IS NOT NULL)
  AND oda_charges = '0';

-- Migrate csd_charge → csd_delivery_charge
UPDATE couriercart_b2b_additional_charges
SET csd_delivery_charge = COALESCE(csd_charge, '0')
WHERE csd_charge IS NOT NULL AND csd_delivery_charge = '0';

-- Migrate time-specific fields
UPDATE couriercart_b2b_additional_charges
SET 
  time_specific_delivery_charge = COALESCE(time_specific_delivery_charge_per_kg, '0'),
  time_specific_method = COALESCE(time_specific_calculation_method, 'per_kg_or_500')
WHERE (time_specific_delivery_charge_per_kg IS NOT NULL OR time_specific_delivery_charge_per_awb IS NOT NULL)
  AND time_specific_delivery_charge = '0';

-- Migrate mall delivery fields
UPDATE couriercart_b2b_additional_charges
SET 
  mall_delivery_charge = COALESCE(mall_delivery_charge_per_kg, '0'),
  mall_delivery_method = COALESCE(mall_calculation_method, 'per_kg_or_500')
WHERE (mall_delivery_charge_per_kg IS NOT NULL OR mall_delivery_charge_per_awb IS NOT NULL)
  AND mall_delivery_charge = '0';

-- Migrate attempt charge fields
UPDATE couriercart_b2b_additional_charges
SET 
  delivery_reattempt_charge = COALESCE(attempt_charge_per_kg, '0'),
  delivery_reattempt_method = COALESCE(attempt_calculation_method, 'per_kg_or_500')
WHERE (attempt_charge_per_kg IS NOT NULL OR attempt_charge_per_awb IS NOT NULL)
  AND delivery_reattempt_charge = '0';

-- Migrate demurrage fields
UPDATE couriercart_b2b_additional_charges
SET 
  demurrage_charges = COALESCE(demurrage_per_awb_day, demurrage_per_kg_day, '0'),
  demurrage_method = CASE 
    WHEN demurrage_per_awb_day IS NOT NULL AND demurrage_per_awb_day > 0 THEN 'per_awb_day'
    WHEN demurrage_per_kg_day IS NOT NULL AND demurrage_per_kg_day > 0 THEN 'per_kg_day'
    ELSE 'per_awb_day'
  END
WHERE (demurrage_per_awb_day IS NOT NULL OR demurrage_per_kg_day IS NOT NULL)
  AND demurrage_charges = '0';

-- Migrate handling fields
UPDATE couriercart_b2b_additional_charges
SET 
  handling_below_100_kg = COALESCE(handling_charge_lt_100, '0'),
  handling_100_to_200_kg = COALESCE(handling_charge_100_200, '0'),
  handling_above_200_kg = COALESCE(handling_charge_gt_200, '0')
WHERE (handling_charge_lt_100 IS NOT NULL OR handling_charge_100_200 IS NOT NULL OR handling_charge_gt_200 IS NOT NULL)
  AND handling_below_100_kg = '0';

-- Migrate insurance_percent → insurance_charge (if you want to preserve percentage as a value)
-- Note: This is optional - insurance_charge is now a flat amount, not percentage
UPDATE couriercart_b2b_additional_charges
SET insurance_charge = COALESCE(insurance_percent, '0')
WHERE insurance_percent IS NOT NULL AND insurance_charge = '0';

-- Migrate cod_flat/cod_percent → cod_charge (use flat as base, calculation happens in code)
UPDATE couriercart_b2b_additional_charges
SET cod_charge = COALESCE(cod_flat, '0')
WHERE cod_flat IS NOT NULL AND cod_charge = '0';

-- Migrate rov_flat/rov_percent → rov_charge (use flat as base, calculation happens in code)
UPDATE couriercart_b2b_additional_charges
SET rov_charge = COALESCE(rov_flat, '0')
WHERE rov_flat IS NOT NULL AND rov_charge = '0';

-- Migrate liability_limit → liability_charge
UPDATE couriercart_b2b_additional_charges
SET liability_charge = COALESCE(liability_limit, '0')
WHERE liability_limit IS NOT NULL AND liability_charge = '0';

-- Step 3: Drop old columns (ONLY after verifying data migration worked correctly)
-- WARNING: Backup your database before running these!

ALTER TABLE couriercart_b2b_additional_charges
  DROP COLUMN IF EXISTS awb_charge,
  DROP COLUMN IF EXISTS minimum_chargeable_weight,
  DROP COLUMN IF EXISTS demurrage_per_awb_day,
  DROP COLUMN IF EXISTS demurrage_per_kg_day,
  DROP COLUMN IF EXISTS demurrage_calculation_method,
  DROP COLUMN IF EXISTS pickup_charge,
  DROP COLUMN IF EXISTS holiday_pickup_charge,
  DROP COLUMN IF EXISTS fuel_surcharge_percent,
  DROP COLUMN IF EXISTS green_tax,
  DROP COLUMN IF EXISTS special_surge_charge,
  DROP COLUMN IF EXISTS minimum_lr_charge,
  DROP COLUMN IF EXISTS oda_charge_per_awb,
  DROP COLUMN IF EXISTS oda_charge_per_kg,
  DROP COLUMN IF EXISTS oda_calculation_method,
  DROP COLUMN IF EXISTS csd_charge,
  DROP COLUMN IF EXISTS time_specific_delivery_charge_per_awb,
  DROP COLUMN IF EXISTS time_specific_delivery_charge_per_kg,
  DROP COLUMN IF EXISTS time_specific_calculation_method,
  DROP COLUMN IF EXISTS mall_delivery_charge_per_awb,
  DROP COLUMN IF EXISTS mall_delivery_charge_per_kg,
  DROP COLUMN IF EXISTS mall_calculation_method,
  DROP COLUMN IF EXISTS attempt_charge_per_awb,
  DROP COLUMN IF EXISTS attempt_charge_per_kg,
  DROP COLUMN IF EXISTS attempt_calculation_method,
  DROP COLUMN IF EXISTS handling_charge_single_piece,
  DROP COLUMN IF EXISTS handling_charge_lt_100,
  DROP COLUMN IF EXISTS handling_charge_100_200,
  DROP COLUMN IF EXISTS handling_charge_gt_200,
  DROP COLUMN IF EXISTS insurance_percent,
  DROP COLUMN IF EXISTS cod_flat,
  DROP COLUMN IF EXISTS cod_percent,
  DROP COLUMN IF EXISTS rov_flat,
  DROP COLUMN IF EXISTS rov_percent,
  DROP COLUMN IF EXISTS liability_limit;

-- ============================================================
-- Migration Complete!
-- ============================================================
-- Verify the migration:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'couriercart_b2b_additional_charges'
-- ORDER BY ordinal_position;
-- ============================================================
