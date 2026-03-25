"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.locations = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const createTable = (0, pg_core_1.pgTableCreator)((name) => `meracourierwala_${name}`);
exports.locations = createTable('locations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 15 }).notNull(),
    city: (0, pg_core_1.varchar)('city', { length: 120 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 120 }).notNull(),
    country: (0, pg_core_1.varchar)('country', { length: 120 }).default('India').notNull(),
    // Use jsonb for flexibility of multiple tags (metro, regional, special, etc.)
    tags: (0, pg_core_1.jsonb)('tags')
        .default((0, drizzle_orm_1.sql) `'[]'::jsonb`)
        .notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
