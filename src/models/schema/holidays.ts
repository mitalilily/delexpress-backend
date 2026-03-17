import {
  boolean,
  date,
  integer,
  pgTableCreator,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const createTable = pgTableCreator((name) => `meracourierwala_${name}`)

/**
 * Holidays table for B2B holiday charge calculation
 * Supports:
 * - National holidays (India-wide)
 * - State-specific holidays
 * - Courier-specific holidays
 * - Sundays (handled automatically, but can be overridden)
 */
export const holidays = createTable('holidays', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Holiday details
  name: varchar('name', { length: 200 }).notNull(), // e.g., "Republic Day", "Diwali", "Maharashtra Day"
  date: date('date').notNull(), // The holiday date (YYYY-MM-DD)
  description: text('description'), // Optional description

  // Holiday type
  type: varchar('type', { length: 50 }).notNull(), // 'national' | 'state' | 'courier' | 'sunday'

  // Scope - for state-specific holidays
  state: varchar('state', { length: 200 }), // State name (e.g., "Maharashtra", "Karnataka") - null for national holidays

  // Scope - for courier-specific holidays
  courier_id: integer('courier_id'), // Courier ID - null for non-courier-specific holidays
  service_provider: varchar('service_provider', { length: 100 }), // Service provider - null for non-courier-specific holidays

  // Recurring holidays (for holidays that occur on same date every year)
  is_recurring: boolean('is_recurring').default(false).notNull(), // If true, applies every year on this date
  year: integer('year'), // Specific year if not recurring (null means all years)

  // Status
  is_active: boolean('is_active').default(true).notNull(), // Can be disabled without deleting

  // Metadata
  metadata: text('metadata'), // JSON string for additional data

  // Timestamps
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  created_by: varchar('created_by', { length: 100 }), // Admin user ID who created this
})
