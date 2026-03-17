import { boolean, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const billingPreferences = pgTable('billing_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // 'weekly' | 'monthly' | 'manual' | 'custom'
  frequency: varchar('frequency', { length: 20 }).default('weekly'),

  autoGenerate: boolean('auto_generate').default(true),

  // Used only if frequency = 'custom'
  customFrequencyDays: integer('custom_frequency_days'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// --------------------
// TypeScript Interface
// --------------------
export interface IBillingPreference {
  id: string
  userId: string
  frequency: 'weekly' | 'monthly' | 'manual' | 'custom'
  autoGenerate: boolean
  customFrequencyDays?: number | null
  createdAt?: Date
  updatedAt?: Date
}
