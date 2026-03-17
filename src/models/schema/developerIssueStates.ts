import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const developer_issue_states = pgTable(
  'developer_issue_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    issue_key: varchar('issue_key', { length: 255 }).notNull(),
    source: varchar('source', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    priority: varchar('priority', { length: 20 }).default('medium').notNull(),
    owner_admin_id: uuid('owner_admin_id').references(() => users.id),
    resolved_by_admin_id: uuid('resolved_by_admin_id').references(() => users.id),
    first_seen_at: timestamp('first_seen_at').defaultNow().notNull(),
    last_seen_at: timestamp('last_seen_at').defaultNow().notNull(),
    occurrence_count: integer('occurrence_count').default(1).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
    resolved_at: timestamp('resolved_at'),
    alert_seen_at: timestamp('alert_seen_at'),
  },
  (table) => ({
    issueKeyUnique: uniqueIndex('developer_issue_states_issue_key_unique').on(table.issue_key),
  }),
)
