import { pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { billingInvoices } from './billingInvoices'
import { users } from './users'

export const invoiceDisputeStatusEnum = pgEnum('invoice_dispute_status', [
  'open',
  'in_review',
  'resolved',
  'rejected',
])

export const invoiceDisputes = pgTable('invoice_disputes', {
  id: uuid('id').defaultRandom().primaryKey(),

  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => billingInvoices.id, { onDelete: 'cascade' }),

  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  status: invoiceDisputeStatusEnum('status').default('open').notNull(),
  subject: varchar('subject', { length: 140 }).notNull(),
  details: text('details'),
  lineItemRef: varchar('line_item_ref', { length: 120 }), // optional specific AWB or item id

  resolutionNotes: text('resolution_notes'),
  resolvedBy: uuid('resolved_by').references(() => users.id),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})


