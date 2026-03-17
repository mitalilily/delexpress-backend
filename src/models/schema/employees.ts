import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminId: uuid('admin_id')
    .notNull()
    .references((): (typeof users)['id'] => users.id),
  // ─── Relations ────────────────────────────────────────────────
  userId: uuid('userId')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),

  role: varchar('role', { length: 50 }).notNull(),

  moduleAccess: jsonb('module_access').default('{}'),

  isActive: boolean('is_active').default(true),
  isOnline: boolean('is_online').default(false), // <-- added this

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date()),
})
