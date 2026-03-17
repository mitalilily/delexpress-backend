import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const userPlans = pgTable('user_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('userId')
    .references(() => users.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  plan_id: uuid('plan_id').notNull(), // FK to plans.id
  assigned_at: timestamp('assigned_at').defaultNow(),
  is_active: boolean('is_active').default(true),
})
