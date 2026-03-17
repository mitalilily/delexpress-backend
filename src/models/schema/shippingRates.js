"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingRateSlabs = exports.shippingRates = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var plans_1 = require("./plans");
exports.shippingRates = (0, pg_core_1.pgTable)('shipping_rates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    plan_id: (0, pg_core_1.uuid)('plan_id')
        .references(function () { return plans_1.plans.id; }, { onDelete: 'cascade' })
        .notNull(),
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 50 }),
    cod_charges: (0, pg_core_1.decimal)('cod_charges', { precision: 10, scale: 2 }),
    cod_percent: (0, pg_core_1.decimal)('cod_percent', { precision: 5, scale: 2 }),
    other_charges: (0, pg_core_1.decimal)('other_charges', { precision: 10, scale: 2 }),
    rate: (0, pg_core_1.decimal)('rate', { precision: 10, scale: 2 }).notNull(),
    last_updated: (0, pg_core_1.timestamp)('last_updated').defaultNow(),
    courier_id: (0, pg_core_1.integer)('courier_id').notNull(),
    courier_name: (0, pg_core_1.varchar)('courier_name', { length: 100 }).notNull(),
    mode: (0, pg_core_1.varchar)('mode', { length: 50 }).notNull(),
    business_type: (0, pg_core_1.varchar)('business_type', { length: 10 }).notNull(), // 'b2b' or 'b2c'
    min_weight: (0, pg_core_1.decimal)('min_weight', { precision: 10, scale: 2 }).notNull(),
    zone_id: (0, pg_core_1.uuid)('zone_id').notNull(), // FK to zones.id
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // forward / rto
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.shippingRateSlabs = (0, pg_core_1.pgTable)('shipping_rate_slabs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    shipping_rate_id: (0, pg_core_1.uuid)('shipping_rate_id')
        .references(function () { return exports.shippingRates.id; }, { onDelete: 'cascade' })
        .notNull(),
    weight_from: (0, pg_core_1.decimal)('weight_from', { precision: 10, scale: 3 }).notNull(),
    weight_to: (0, pg_core_1.decimal)('weight_to', { precision: 10, scale: 3 }),
    rate: (0, pg_core_1.decimal)('rate', { precision: 10, scale: 2 }).notNull(),
    extra_rate: (0, pg_core_1.decimal)('extra_rate', { precision: 10, scale: 2 }),
    extra_weight_unit: (0, pg_core_1.decimal)('extra_weight_unit', { precision: 10, scale: 3 }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
