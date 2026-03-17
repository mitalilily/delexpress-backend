import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(), // e.g. Basic, Gold, Enterprise
  description: varchar('description', { length: 255 }),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
})
