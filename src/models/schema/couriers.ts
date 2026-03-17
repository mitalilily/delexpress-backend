import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core'

export const couriers = pgTable(
  'couriers',
  {
    id: integer('id').notNull(), // Courier ID from service provider
    name: varchar('name', { length: 100 }).notNull(),
    serviceProvider: varchar('serviceProvider', { length: 100 }).notNull(),
    isEnabled: boolean('isEnabled').notNull().default(true),
    businessType: jsonb('business_type')
      .$type<('b2c' | 'b2b')[]>()
      .default(sql`'["b2c","b2b"]'::jsonb`)
      .notNull(), // Array: ['b2c'], ['b2b'], or ['b2c', 'b2b']
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    // Composite primary key: same courier ID can exist for different service providers
    pk: primaryKey({ columns: [table.id, table.serviceProvider] }),
  }),
)
