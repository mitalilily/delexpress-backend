import { sql } from 'drizzle-orm'
import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { locations } from './locations'

const createTable = pgTableCreator((name) => `meracourierwala_${name}`)
// optional prefix to avoid naming conflicts

export const zones = createTable(
  'zones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull(), // e.g. A, B, C, D, E, SPECIAL
    name: varchar('name', { length: 120 }).notNull(), // e.g. "Zone A"
    description: text('description'),
    region: varchar('region', { length: 120 }),
    business_type: varchar('business_type', { length: 10 }).notNull(), // B2B / B2C
    // Removed courier_id, service_provider, courier_name, is_global
    // Zones are always global (industry standard). Courier selection happens at rate level.
    metadata: jsonb('metadata'),
    states: jsonb('states')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Zone code should be unique per business type only (zones are always global)
    codeBusinessTypeUnique: uniqueIndex('zones_code_business_type_unique').on(
      table.code,
      table.business_type,
    ),
  }),
)

export const zoneMappings = createTable('zone_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  zone_id: uuid('zone_id')
    .references(() => zones.id, { onDelete: 'cascade' })
    .notNull(),
  location_id: uuid('location_id')
    .references(() => locations.id, { onDelete: 'cascade' })
    .notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Create table - references are handled at DB level via migrations
export const b2bPincodes = createTable('b2b_pincodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  pincode: varchar('pincode', { length: 15 }).notNull(),
  city: varchar('city', { length: 120 }).notNull(),
  state: varchar('state', { length: 120 }).notNull(),
  zone_id: uuid('zone_id').notNull(),
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  is_oda: boolean('is_oda').default(false).notNull(),
  is_remote: boolean('is_remote').default(false).notNull(),
  is_mall: boolean('is_mall').default(false).notNull(),
  is_sez: boolean('is_sez').default(false).notNull(),
  is_airport: boolean('is_airport').default(false).notNull(),
  is_high_security: boolean('is_high_security').default(false).notNull(),
  is_csd: boolean('is_csd').default(false).notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Create table - references are handled at DB level via migrations
export const b2bZoneToZoneRates = createTable('b2b_zone_to_zone_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  plan_id: uuid('plan_id'), // Optional - for plan-based pricing (similar to B2C)
  origin_zone_id: uuid('origin_zone_id').notNull(),
  destination_zone_id: uuid('destination_zone_id').notNull(),
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  // Rate per kg (only field needed)
  rate_per_kg: decimal('rate_per_kg', { precision: 12, scale: 4 }).notNull(), // Per kg rate - required
  // Volumetric weight calculation
  volumetric_factor: decimal('volumetric_factor', { precision: 6, scale: 2 }).default('5000'), // e.g. 5000 or 6000
  // Effective dates
  effective_from: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
  effective_to: timestamp('effective_to', { withTimezone: true }),
  is_active: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Zone regions for state/pincode pattern mappings
export const b2bZoneRegions = createTable('b2b_zone_regions', {
  id: uuid('id').defaultRandom().primaryKey(),
  zone_id: uuid('zone_id')
    .references(() => zones.id, { onDelete: 'cascade' })
    .notNull(),
  state: varchar('state', { length: 200 }),
  pincode_pattern: varchar('pincode_pattern', { length: 50 }), // e.g. '1100*' or regex pattern
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Create table without constraints first - constraints can be added via migrations
export const b2bOverheadRules = createTable('b2b_overhead_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  plan_id: uuid('plan_id'), // Optional - for plan-based pricing
  code: varchar('code', { length: 50 }), // Unique code like 'AWB_CHARGE', 'FUEL_SURCHARGE', 'ODA'
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 20 }).notNull(), // flat_awb | flat | percent | per_kg | per_awb_day
  amount: decimal('amount', { precision: 12, scale: 2 }), // For flat charges
  percent: decimal('percent', { precision: 6, scale: 2 }), // For percentage-based charges
  applies_to: varchar('applies_to', { length: 50 }).default('freight'), // freight | final | cod | all
  condition: jsonb('condition'), // JSONB for complex conditions: {"oda": true, "zones": ["EAST"], "min_weight": 20}
  priority: integer('priority').default(0), // Order of application
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  business_type: varchar('business_type', { length: 10 }).default('B2B').notNull(),
  effective_from: timestamp('effective_from', { withTimezone: true }).defaultNow(),
  effective_to: timestamp('effective_to', { withTimezone: true }),
  is_active: boolean('is_active').default(true).notNull(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Zone to state mappings (admin-controlled)
export const b2bZoneStates = createTable('b2b_zone_states', {
  id: uuid('id').defaultRandom().primaryKey(),
  zone_id: uuid('zone_id')
    .references(() => zones.id, { onDelete: 'cascade' })
    .notNull(),
  state_name: varchar('state_name', { length: 200 }).notNull(),
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Overhead charges configuration (single row per courier scope)
// Replaces old "Extra Charges" system with exact 20 fields from requirements
export const b2bAdditionalCharges = createTable('b2b_additional_charges', {
  id: uuid('id').defaultRandom().primaryKey(),
  plan_id: uuid('plan_id'), // Optional - for plan-based pricing
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),

  // 1. AWB Charges (₹) - condition: "per AWB / per LR"
  awb_charges: decimal('awb_charges', { precision: 12, scale: 2 }).default('0'),

  // 2. CFT Factor - condition: "Higher of volumetric vs actual weight"
  cft_factor: decimal('cft_factor', { precision: 6, scale: 2 }).default('5'),

  // 3. Minimum Chargeable - condition: "Rs OR Kg" (admin-selectable method)
  minimum_chargeable_amount: decimal('minimum_chargeable_amount', {
    precision: 12,
    scale: 2,
  }).default('0'), // Rs amount
  minimum_chargeable_weight: decimal('minimum_chargeable_weight', {
    precision: 12,
    scale: 2,
  }).default('0'), // Weight in kg
  minimum_chargeable_method: varchar('minimum_chargeable_method', { length: 20 }).default(
    'whichever_is_higher',
  ), // 'whichever_is_higher' | 'whichever_is_lower'

  // 4. Free Storage Days - condition: "Days"
  free_storage_days: integer('free_storage_days').default(5),

  // 5. Demurrage Charges - condition: "Rs per AWB/day OR Rs per Kg/day" (admin-selectable method)
  demurrage_per_awb_day: decimal('demurrage_per_awb_day', { precision: 12, scale: 2 }).default('0'), // Rs per AWB/day
  demurrage_per_kg_day: decimal('demurrage_per_kg_day', { precision: 12, scale: 2 }).default('0'), // Rs per Kg/day
  demurrage_method: varchar('demurrage_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'

  // 6. Public Holiday Pickup Charge - condition: "Rs Additional"
  public_holiday_pickup_charge: decimal('public_holiday_pickup_charge', {
    precision: 12,
    scale: 2,
  }).default('0'),

  // 7. Fuel Surcharge Percentage - condition: "% on basic freight"
  fuel_surcharge_percentage: decimal('fuel_surcharge_percentage', {
    precision: 6,
    scale: 2,
  }).default('0'),

  // 7a. Green Tax - condition: "Rs Additional"
  green_tax: decimal('green_tax', { precision: 12, scale: 2 }).default('0'),

  // 8. ODA Charges - condition: "Rs per AWB OR Rs per Kg" (admin-selectable method)
  oda_charges: decimal('oda_charges', { precision: 12, scale: 2 }).default('0'), // Rs per AWB
  oda_per_kg_charge: decimal('oda_per_kg_charge', { precision: 12, scale: 2 }).default('0'), // Rs per Kg
  oda_method: varchar('oda_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'

  // 10. CSD Delivery Charge - condition: "Rs Additional per AWB"
  csd_delivery_charge: decimal('csd_delivery_charge', { precision: 12, scale: 2 }).default('0'),

  // 11. Time Specific Delivery Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
  time_specific_per_kg: decimal('time_specific_per_kg', {
    precision: 12,
    scale: 2,
  }).default('0'), // Rs per Kg
  time_specific_per_awb: decimal('time_specific_per_awb', {
    precision: 12,
    scale: 2,
  }).default('500'), // Rs per AWB (default 500)
  time_specific_method: varchar('time_specific_method', { length: 20 }).default(
    'whichever_is_higher',
  ), // 'whichever_is_higher' | 'whichever_is_lower'

  // 12. Mall Delivery Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
  mall_delivery_per_kg: decimal('mall_delivery_per_kg', { precision: 12, scale: 2 }).default('0'), // Rs per Kg
  mall_delivery_per_awb: decimal('mall_delivery_per_awb', { precision: 12, scale: 2 }).default(
    '500',
  ), // Rs per AWB (default 500)
  mall_delivery_method: varchar('mall_delivery_method', { length: 20 }).default(
    'whichever_is_higher',
  ), // 'whichever_is_higher' | 'whichever_is_lower'

  // 13. Delivery Reattempt Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
  delivery_reattempt_per_kg: decimal('delivery_reattempt_per_kg', {
    precision: 12,
    scale: 2,
  }).default('0'), // Rs per Kg
  delivery_reattempt_per_awb: decimal('delivery_reattempt_per_awb', {
    precision: 12,
    scale: 2,
  }).default('500'), // Rs per AWB (default 500)
  delivery_reattempt_method: varchar('delivery_reattempt_method', { length: 20 }).default(
    'whichever_is_higher',
  ), // 'whichever_is_higher' | 'whichever_is_lower'

  // 14. Handling Single Piece - condition: "Applicable only when shipment is a single piece"
  handling_single_piece: decimal('handling_single_piece', { precision: 12, scale: 2 }).default('0'),

  // 15. Handling Below 100 Kg - condition: "Applied when weight < 100 kg"
  handling_below_100_kg: decimal('handling_below_100_kg', { precision: 12, scale: 2 }).default('0'),

  // 16. Handling 100 To 200 Kg - condition: "Applied when weight is 100–200 kg"
  handling_100_to_200_kg: decimal('handling_100_to_200_kg', { precision: 12, scale: 2 }).default(
    '0',
  ),

  // 17. Handling Above 200 Kg - condition: "Applied when weight > 200 kg"
  handling_above_200_kg: decimal('handling_above_200_kg', { precision: 12, scale: 2 }).default('0'),

  // 18. Insurance Charge - condition: "Optional"
  insurance_charge: decimal('insurance_charge', { precision: 12, scale: 2 }).default('0'),

  // 19. COD Charge - condition: "INR 50 OR 1% of Invoice Value" (admin-selectable method)
  cod_fixed_amount: decimal('cod_fixed_amount', { precision: 12, scale: 2 }).default('50'), // Fixed amount (INR 50)
  cod_percentage: decimal('cod_percentage', { precision: 6, scale: 2 }).default('1'), // Percentage of invoice (1%)
  cod_method: varchar('cod_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'

  // 20. ROV Charge - condition: "0.5% OR 100 of Invoice Value" (admin-selectable method)
  rov_fixed_amount: decimal('rov_fixed_amount', { precision: 12, scale: 2 }).default('100'), // Fixed amount (100)
  rov_percentage: decimal('rov_percentage', { precision: 6, scale: 2 }).default('0.5'), // Percentage of invoice (0.5%)
  rov_method: varchar('rov_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'

  // 21. Liability Charge - condition: "5000 OR Actual value of product" (admin-selectable method)
  liability_limit: decimal('liability_limit', { precision: 12, scale: 2 }).default('5000'), // Liability limit (5000)
  liability_method: varchar('liability_method', { length: 20 }).default('whichever_is_lower'), // 'whichever_is_higher' | 'whichever_is_lower'

  // Custom fields stored as JSONB - admin can add any custom charges here
  custom_fields: jsonb('custom_fields').$type<Record<string, any>>(),
  // Field definitions - stores admin-configured field labels, visibility, grouping, etc.
  field_definitions: jsonb('field_definitions').$type<{
    [fieldKey: string]: {
      label: string // Custom label for the field
      visible: boolean // Whether to show this field
      group?: string // Which group/card this field belongs to
      order?: number // Display order
      description?: string // Custom description/helper text
      unit?: string // Unit to display (₹, %, kg, etc.)
      // Advanced configuration for custom fields
      fieldType?: 'single' | 'dual' // Single value or dual value (per AWB + per Kg)
      calculationMethod?:
        | 'whichever_is_higher'
        | 'whichever_is_lower'
        | 'sum'
        | 'per_awb_only'
        | 'per_kg_only' // For dual-value fields
      chargeType?: 'flat' | 'percent' | 'per_kg' // Type of charge
      appliesTo?: 'freight' | 'total' | 'base' // What the charge applies to
      condition?: Record<string, any> // Optional JSON condition for when to apply
    }
  }>(),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Volumetric rules configuration
export const b2bVolumetricRules = createTable('b2b_volumetric_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  courier_id: integer('courier_id'),
  service_provider: varchar('service_provider', { length: 100 }),
  volumetric_divisor: decimal('volumetric_divisor', { precision: 10, scale: 2 }).default('5000'), // L*W*H / divisor
  cft_factor: decimal('cft_factor', { precision: 6, scale: 2 }).default('5'), // CFT conversion factor
  minimum_volumetric_weight: decimal('minimum_volumetric_weight', {
    precision: 10,
    scale: 2,
  }).default('0'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
