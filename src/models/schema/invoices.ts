import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// Enum for invoice status
export const invoiceStatus = pgEnum('invoice_status', ['paid', 'pending', 'overdue'])

export const invoiceType = pgEnum('invoice_type', ['b2b', 'b2c'])

// --------------------
// INVOICES (Single Table)
// --------------------
export const invoices = pgTable('invoices', {
  id: integer('id').primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: invoiceType('type').notNull().default('b2c'),

  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  billingPeriodFrom: date('billing_period_from').notNull(),
  billingPeriodTo: date('billing_period_to').notNull(),
  link: varchar('link', { length: 150 }).notNull(),

  totalOrders: integer('total_orders').notNull().default(0),
  invoiceDate: date('invoice_date').notNull(),
  netPayableAmount: numeric('net_payable_amount', { precision: 12, scale: 2 }).notNull(),
  status: invoiceStatus('status').notNull().default('pending'),

  // 🧾 All order details (per order charges, taxes, etc.) stored here
  items: jsonb('items').notNull().$type<
    {
      orderId: string
      carrier: string
      awb: string
      weightSlab: string
      shippingCharge: number
      fuelSurcharge?: number
      codCharge?: number
      rtoCharge?: number
      tax?: number
      discount?: number
      finalCharge: number
    }[]
  >(),

  createdAt: timestamp('created_at').defaultNow(),
})
