import { decimal, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { billingInvoices } from './billingInvoices'
import { codRemittances } from './codRemittance'
import { users } from './users'

export const invoiceCodOffsets = pgTable('invoice_cod_offsets', {
  id: uuid('id').defaultRandom().primaryKey(),

  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => billingInvoices.id, { onDelete: 'cascade' }),

  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  codRemittanceId: uuid('cod_remittance_id')
    .notNull()
    .references(() => codRemittances.id, { onDelete: 'cascade' }),

  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),

  createdAt: timestamp('created_at').defaultNow(),
})


