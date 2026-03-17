import { json, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

export const courierPriorityProfiles = pgTable(
  'courier_priority_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id').notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    personalised_order:
      json('personalised_order').$type<{ courierId: string; priority: number; name: string }[]>(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // 🔹 Enforce uniqueness at DB level
    uniqUserName: uniqueIndex('uniq_user_priority').on(table.user_id, table.name),
  }),
)
