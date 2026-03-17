import { boolean, decimal, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { billingInvoices } from './billingInvoices'
import { users } from './users'

export const invoiceAdjustmentTypeEnum = pgEnum('invoice_adjustment_type', [
  'credit',
  'debit',
  'waiver',
  'surcharge',
])

export const invoiceAdjustments = pgTable('invoice_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),

  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => billingInvoices.id, { onDelete: 'cascade' }),

  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  type: invoiceAdjustmentTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason'),

  // Mark if this adjustment has been applied/processed
  // This prevents double-counting when adjustments are accepted or payments are made
  isApplied: boolean('is_applied').default(false).notNull(),

  createdBy: uuid('created_by').references(() => users.id),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})


