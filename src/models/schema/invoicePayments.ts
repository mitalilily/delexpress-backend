import { decimal, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { billingInvoices } from './billingInvoices'
import { users } from './users'

export const invoicePaymentMethodEnum = pgEnum('invoice_payment_method', [
  'upi',
  'neft',
  'pg',
  'wallet',
])

export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').defaultRandom().primaryKey(),

  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => billingInvoices.id, { onDelete: 'cascade' }),

  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  method: invoicePaymentMethodEnum('method').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  reference: varchar('reference', { length: 120 }),
  notes: text('notes'),

  createdAt: timestamp('created_at').defaultNow(),
})
