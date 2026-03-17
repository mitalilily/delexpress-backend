// db/schema/supportTickets.ts
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'resolved',
  'closed',
])

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  subject: text('subject').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull(),
  awbNumber: text('awb_number'),
  description: text('description').notNull(),
  attachments: text('attachments').array().default([]), // ⬅️ this line
  dueDate: timestamp('due_date', { withTimezone: true }),
  status: ticketStatusEnum('status').default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})
