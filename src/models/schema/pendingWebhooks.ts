// schema/pendingWebhooks.ts
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const pending_webhooks = pgTable('pending_webhooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  awb_number: text('awb_number'),
  status: text('status').default('unknown').notNull(),
  payload: jsonb('payload').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  processed_at: timestamp('processed_at'),
})
