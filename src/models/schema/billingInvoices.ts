import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'disputed'])
export const billingInvoiceTypeEnum = pgEnum('billingInvoiceTypeEnum', [
  'weekly',
  'monthly_summary',
  'manual',
])

export const billingInvoices = pgTable('billingInvoices', {
  id: uuid('id').defaultRandom().primaryKey(),

  invoiceNo: varchar('invoice_no', { length: 50 }).notNull().unique(),

  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  billingStart: date('billing_start').notNull(),
  billingEnd: date('billing_end').notNull(),

  taxableValue: decimal('taxable_value', { precision: 12, scale: 2 }).default('0'),
  cgst: decimal('cgst', { precision: 12, scale: 2 }).default('0'),
  sgst: decimal('sgst', { precision: 12, scale: 2 }).default('0'),
  igst: decimal('igst', { precision: 12, scale: 2 }).default('0'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).default('0'),

  gstRate: integer('gst_rate').default(18),

  status: invoiceStatusEnum('status').default('pending').notNull(),
  type: billingInvoiceTypeEnum('type').default('weekly').notNull(),

  pdfUrl: text('pdf_url').notNull(), // GST tax invoice (human readable)
  csvUrl: text('csv_url').notNull(), // detailed bifurcation file

  orderNumbers: jsonb('order_numbers').$type<string[]>(), // Store order numbers for quick reference

  isDisputed: boolean('is_disputed').default(false),
  remarks: text('remarks'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
