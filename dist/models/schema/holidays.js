"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.holidays = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const createTable = (0, pg_core_1.pgTableCreator)((name) => `meracourierwala_${name}`);
/**
 * Holidays table for B2B holiday charge calculation
 * Supports:
 * - National holidays (India-wide)
 * - State-specific holidays
 * - Courier-specific holidays
 * - Sundays (handled automatically, but can be overridden)
 */
exports.holidays = createTable('holidays', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // Holiday details
    name: (0, pg_core_1.varchar)('name', { length: 200 }).notNull(), // e.g., "Republic Day", "Diwali", "Maharashtra Day"
    date: (0, pg_core_1.date)('date').notNull(), // The holiday date (YYYY-MM-DD)
    description: (0, pg_core_1.text)('description'), // Optional description
    // Holiday type
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // 'national' | 'state' | 'courier' | 'sunday'
    // Scope - for state-specific holidays
    state: (0, pg_core_1.varchar)('state', { length: 200 }), // State name (e.g., "Maharashtra", "Karnataka") - null for national holidays
    // Scope - for courier-specific holidays
    courier_id: (0, pg_core_1.integer)('courier_id'), // Courier ID - null for non-courier-specific holidays
    service_provider: (0, pg_core_1.varchar)('service_provider', { length: 100 }), // Service provider - null for non-courier-specific holidays
    // Recurring holidays (for holidays that occur on same date every year)
    is_recurring: (0, pg_core_1.boolean)('is_recurring').default(false).notNull(), // If true, applies every year on this date
    year: (0, pg_core_1.integer)('year'), // Specific year if not recurring (null means all years)
    // Status
    is_active: (0, pg_core_1.boolean)('is_active').default(true).notNull(), // Can be disabled without deleting
    // Metadata
    metadata: (0, pg_core_1.text)('metadata'), // JSON string for additional data
    // Timestamps
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_by: (0, pg_core_1.varchar)('created_by', { length: 100 }), // Admin user ID who created this
});
