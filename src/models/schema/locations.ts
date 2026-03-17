import { sql } from 'drizzle-orm'
import { jsonb, pgTableCreator, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

const createTable = pgTableCreator((name) => `meracourierwala_${name}`)

export const locations = createTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),

  pincode: varchar('pincode', { length: 15 }).notNull(),
  city: varchar('city', { length: 120 }).notNull(),
  state: varchar('state', { length: 120 }).notNull(),
  country: varchar('country', { length: 120 }).default('India').notNull(),
  // Use jsonb for flexibility of multiple tags (metro, regional, special, etc.)

  tags: jsonb('tags')
    .default(sql`'[]'::jsonb`)
    .notNull(),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
