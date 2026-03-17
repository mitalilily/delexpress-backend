import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const developer_issue_audit_logs = pgTable('developer_issue_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  issue_key: varchar('issue_key', { length: 255 }).notNull(),
  admin_user_id: uuid('admin_user_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  note: text('note'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})
