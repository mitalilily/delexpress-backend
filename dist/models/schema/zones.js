"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.b2bVolumetricRules = exports.b2bAdditionalCharges = exports.b2bZoneStates = exports.b2bOverheadRules = exports.b2bZoneRegions = exports.b2bZoneToZoneRates = exports.b2bPincodes = exports.zoneMappings = exports.zones = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const locations_1 = require("./locations");
const createTable = (0, pg_core_1.pgTableCreator)((name) => `meracourierwala_${name}`);
// optional prefix to avoid naming conflicts
exports.zones = createTable('zones', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    code: (0, pg_core_1.varchar)('code', { length: 50 }).notNull(), // e.g. A, B, C, D, E, SPECIAL
    name: (0, pg_core_1.varchar)('name', { length: 120 }).notNull(), // e.g. "Zone A"
    description: (0, pg_core_1.text)('description'),
    region: (0, pg_core_1.varchar)('region', { length: 120 }),
    business_type: (0, pg_core_1.varchar)('business_type', { length: 10 }).notNull(), // B2B / B2C
    // Removed courier_id, service_provider, courier_name, is_global
    // Zones are always global (industry standard). Courier selection happens at rate level.
    metadata: (0, pg_core_1.jsonb)('metadata'),
    states: (0, pg_core_1.jsonb)('states')
        .$type()
        .default((0, drizzle_orm_1.sql) `'[]'::jsonb`)
        .notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    // Zone code should be unique per business type only (zones are always global)
    codeBusinessTypeUnique: (0, pg_core_1.uniqueIndex)('zones_code_business_type_unique').on(table.code, table.business_type),
}));
exports.zoneMappings = createTable('zone_mappings', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    zone_id: (0, pg_core_1.uuid)('zone_id')
        .references(() => exports.zones.id, { onDelete: 'cascade' })
        .notNull(),
    location_id: (0, pg_core_1.uuid)('location_id')
        .references(() => locations_1.locations.id, { onDelete: 'cascade' })
        .notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// Create table - references are handled at DB level via migrations
exports.b2bPincodes = createTable('b2b_pincodes', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 15 }).notNull(),
    city: (0, pg_core_1.varchar)('city', { length: 120 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 120 }).notNull(),
    zone_id: (0, pg_core_1.uuid)('zone_id').notNull(),
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    is_oda: (0, pg_core_1.boolean)('is_oda').default(false).notNull(),
    is_remote: (0, pg_core_1.boolean)('is_remote').default(false).notNull(),
    is_mall: (0, pg_core_1.boolean)('is_mall').default(false).notNull(),
    is_sez: (0, pg_core_1.boolean)('is_sez').default(false).notNull(),
    is_airport: (0, pg_core_1.boolean)('is_airport').default(false).notNull(),
    is_high_security: (0, pg_core_1.boolean)('is_high_security').default(false).notNull(),
    is_csd: (0, pg_core_1.boolean)('is_csd').default(false).notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// Create table - references are handled at DB level via migrations
exports.b2bZoneToZoneRates = createTable('b2b_zone_to_zone_rates', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    plan_id: (0, pg_core_1.uuid)('plan_id'), // Optional - for plan-based pricing (similar to B2C)
    origin_zone_id: (0, pg_core_1.uuid)('origin_zone_id').notNull(),
    destination_zone_id: (0, pg_core_1.uuid)('destination_zone_id').notNull(),
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    // Rate per kg (only field needed)
    rate_per_kg: (0, pg_core_1.decimal)('rate_per_kg', { precision: 12, scale: 4 }).notNull(), // Per kg rate - required
    // Volumetric weight calculation
    volumetric_factor: (0, pg_core_1.decimal)('volumetric_factor', { precision: 6, scale: 2 }).default('5000'), // e.g. 5000 or 6000
    // Effective dates
    effective_from: (0, pg_core_1.timestamp)('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effective_to: (0, pg_core_1.timestamp)('effective_to', { withTimezone: true }),
    is_active: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// Zone regions for state/pincode pattern mappings
exports.b2bZoneRegions = createTable('b2b_zone_regions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    zone_id: (0, pg_core_1.uuid)('zone_id')
        .references(() => exports.zones.id, { onDelete: 'cascade' })
        .notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 200 }),
    pincode_pattern: (0, pg_core_1.varchar)('pincode_pattern', { length: 50 }), // e.g. '1100*' or regex pattern
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// Create table without constraints first - constraints can be added via migrations
exports.b2bOverheadRules = createTable('b2b_overhead_rules', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    plan_id: (0, pg_core_1.uuid)('plan_id'), // Optional - for plan-based pricing
    code: (0, pg_core_1.varchar)('code', { length: 50 }), // Unique code like 'AWB_CHARGE', 'FUEL_SURCHARGE', 'ODA'
    name: (0, pg_core_1.varchar)('name', { length: 150 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // flat_awb | flat | percent | per_kg | per_awb_day
    amount: (0, pg_core_1.decimal)('amount', { precision: 12, scale: 2 }), // For flat charges
    percent: (0, pg_core_1.decimal)('percent', { precision: 6, scale: 2 }), // For percentage-based charges
    applies_to: (0, pg_core_1.varchar)('applies_to', { length: 50 }).default('freight'), // freight | final | cod | all
    condition: (0, pg_core_1.jsonb)('condition'), // JSONB for complex conditions: {"oda": true, "zones": ["EAST"], "min_weight": 20}
    priority: (0, pg_core_1.integer)('priority').default(0), // Order of application
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    business_type: (0, pg_core_1.varchar)('business_type', { length: 10 }).default('B2B').notNull(),
    effective_from: (0, pg_core_1.timestamp)('effective_from', { withTimezone: true }).defaultNow(),
    effective_to: (0, pg_core_1.timestamp)('effective_to', { withTimezone: true }),
    is_active: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// Zone to state mappings (admin-controlled)
exports.b2bZoneStates = createTable('b2b_zone_states', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    zone_id: (0, pg_core_1.uuid)('zone_id')
        .references(() => exports.zones.id, { onDelete: 'cascade' })
        .notNull(),
    state_name: (0, pg_core_1.varchar)('state_name', { length: 200 }).notNull(),
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// Overhead charges configuration (single row per courier scope)
// Replaces old "Extra Charges" system with exact 20 fields from requirements
exports.b2bAdditionalCharges = createTable('b2b_additional_charges', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    plan_id: (0, pg_core_1.uuid)('plan_id'), // Optional - for plan-based pricing
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    // 1. AWB Charges (₹) - condition: "per AWB / per LR"
    awb_charges: (0, pg_core_1.decimal)('awb_charges', { precision: 12, scale: 2 }).default('0'),
    // 2. CFT Factor - condition: "Higher of volumetric vs actual weight"
    cft_factor: (0, pg_core_1.decimal)('cft_factor', { precision: 6, scale: 2 }).default('5'),
    // 3. Minimum Chargeable - condition: "Rs OR Kg" (admin-selectable method)
    minimum_chargeable_amount: (0, pg_core_1.decimal)('minimum_chargeable_amount', {
        precision: 12,
        scale: 2,
    }).default('0'), // Rs amount
    minimum_chargeable_weight: (0, pg_core_1.decimal)('minimum_chargeable_weight', {
        precision: 12,
        scale: 2,
    }).default('0'), // Weight in kg
    minimum_chargeable_method: (0, pg_core_1.varchar)('minimum_chargeable_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 4. Free Storage Days - condition: "Days"
    free_storage_days: (0, pg_core_1.integer)('free_storage_days').default(5),
    // 5. Demurrage Charges - condition: "Rs per AWB/day OR Rs per Kg/day" (admin-selectable method)
    demurrage_per_awb_day: (0, pg_core_1.decimal)('demurrage_per_awb_day', { precision: 12, scale: 2 }).default('0'), // Rs per AWB/day
    demurrage_per_kg_day: (0, pg_core_1.decimal)('demurrage_per_kg_day', { precision: 12, scale: 2 }).default('0'), // Rs per Kg/day
    demurrage_method: (0, pg_core_1.varchar)('demurrage_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 6. Public Holiday Pickup Charge - condition: "Rs Additional"
    public_holiday_pickup_charge: (0, pg_core_1.decimal)('public_holiday_pickup_charge', {
        precision: 12,
        scale: 2,
    }).default('0'),
    // 7. Fuel Surcharge Percentage - condition: "% on basic freight"
    fuel_surcharge_percentage: (0, pg_core_1.decimal)('fuel_surcharge_percentage', {
        precision: 6,
        scale: 2,
    }).default('0'),
    // 7a. Green Tax - condition: "Rs Additional"
    green_tax: (0, pg_core_1.decimal)('green_tax', { precision: 12, scale: 2 }).default('0'),
    // 8. ODA Charges - condition: "Rs per AWB OR Rs per Kg" (admin-selectable method)
    oda_charges: (0, pg_core_1.decimal)('oda_charges', { precision: 12, scale: 2 }).default('0'), // Rs per AWB
    oda_per_kg_charge: (0, pg_core_1.decimal)('oda_per_kg_charge', { precision: 12, scale: 2 }).default('0'), // Rs per Kg
    oda_method: (0, pg_core_1.varchar)('oda_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 10. CSD Delivery Charge - condition: "Rs Additional per AWB"
    csd_delivery_charge: (0, pg_core_1.decimal)('csd_delivery_charge', { precision: 12, scale: 2 }).default('0'),
    // 11. Time Specific Delivery Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
    time_specific_per_kg: (0, pg_core_1.decimal)('time_specific_per_kg', {
        precision: 12,
        scale: 2,
    }).default('0'), // Rs per Kg
    time_specific_per_awb: (0, pg_core_1.decimal)('time_specific_per_awb', {
        precision: 12,
        scale: 2,
    }).default('500'), // Rs per AWB (default 500)
    time_specific_method: (0, pg_core_1.varchar)('time_specific_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 12. Mall Delivery Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
    mall_delivery_per_kg: (0, pg_core_1.decimal)('mall_delivery_per_kg', { precision: 12, scale: 2 }).default('0'), // Rs per Kg
    mall_delivery_per_awb: (0, pg_core_1.decimal)('mall_delivery_per_awb', { precision: 12, scale: 2 }).default('500'), // Rs per AWB (default 500)
    mall_delivery_method: (0, pg_core_1.varchar)('mall_delivery_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 13. Delivery Reattempt Charge - condition: "Rs per Kg OR Rs per AWB" (admin-selectable method)
    delivery_reattempt_per_kg: (0, pg_core_1.decimal)('delivery_reattempt_per_kg', {
        precision: 12,
        scale: 2,
    }).default('0'), // Rs per Kg
    delivery_reattempt_per_awb: (0, pg_core_1.decimal)('delivery_reattempt_per_awb', {
        precision: 12,
        scale: 2,
    }).default('500'), // Rs per AWB (default 500)
    delivery_reattempt_method: (0, pg_core_1.varchar)('delivery_reattempt_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 14. Handling Single Piece - condition: "Applicable only when shipment is a single piece"
    handling_single_piece: (0, pg_core_1.decimal)('handling_single_piece', { precision: 12, scale: 2 }).default('0'),
    // 15. Handling Below 100 Kg - condition: "Applied when weight < 100 kg"
    handling_below_100_kg: (0, pg_core_1.decimal)('handling_below_100_kg', { precision: 12, scale: 2 }).default('0'),
    // 16. Handling 100 To 200 Kg - condition: "Applied when weight is 100–200 kg"
    handling_100_to_200_kg: (0, pg_core_1.decimal)('handling_100_to_200_kg', { precision: 12, scale: 2 }).default('0'),
    // 17. Handling Above 200 Kg - condition: "Applied when weight > 200 kg"
    handling_above_200_kg: (0, pg_core_1.decimal)('handling_above_200_kg', { precision: 12, scale: 2 }).default('0'),
    // 18. Insurance Charge - condition: "Optional"
    insurance_charge: (0, pg_core_1.decimal)('insurance_charge', { precision: 12, scale: 2 }).default('0'),
    // 19. COD Charge - condition: "INR 50 OR 1% of Invoice Value" (admin-selectable method)
    cod_fixed_amount: (0, pg_core_1.decimal)('cod_fixed_amount', { precision: 12, scale: 2 }).default('50'), // Fixed amount (INR 50)
    cod_percentage: (0, pg_core_1.decimal)('cod_percentage', { precision: 6, scale: 2 }).default('1'), // Percentage of invoice (1%)
    cod_method: (0, pg_core_1.varchar)('cod_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 20. ROV Charge - condition: "0.5% OR 100 of Invoice Value" (admin-selectable method)
    rov_fixed_amount: (0, pg_core_1.decimal)('rov_fixed_amount', { precision: 12, scale: 2 }).default('100'), // Fixed amount (100)
    rov_percentage: (0, pg_core_1.decimal)('rov_percentage', { precision: 6, scale: 2 }).default('0.5'), // Percentage of invoice (0.5%)
    rov_method: (0, pg_core_1.varchar)('rov_method', { length: 20 }).default('whichever_is_higher'), // 'whichever_is_higher' | 'whichever_is_lower'
    // 21. Liability Charge - condition: "5000 OR Actual value of product" (admin-selectable method)
    liability_limit: (0, pg_core_1.decimal)('liability_limit', { precision: 12, scale: 2 }).default('5000'), // Liability limit (5000)
    liability_method: (0, pg_core_1.varchar)('liability_method', { length: 20 }).default('whichever_is_lower'), // 'whichever_is_higher' | 'whichever_is_lower'
    // Custom fields stored as JSONB - admin can add any custom charges here
    custom_fields: (0, pg_core_1.jsonb)('custom_fields').$type(),
    // Field definitions - stores admin-configured field labels, visibility, grouping, etc.
    field_definitions: (0, pg_core_1.jsonb)('field_definitions').$type(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// Volumetric rules configuration
exports.b2bVolumetricRules = createTable('b2b_volumetric_rules', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    courier_id: (0, pg_core_1.integer)('courier_id'),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }),
    volumetric_divisor: (0, pg_core_1.decimal)('volumetric_divisor', { precision: 10, scale: 2 }).default('5000'), // L*W*H / divisor
    cft_factor: (0, pg_core_1.decimal)('cft_factor', { precision: 6, scale: 2 }).default('5'), // CFT conversion factor
    minimum_volumetric_weight: (0, pg_core_1.decimal)('minimum_volumetric_weight', {
        precision: 10,
        scale: 2,
    }).default('0'),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
