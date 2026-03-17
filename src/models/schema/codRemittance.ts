import { decimal, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

// COD Remittance Status - Wallet Integrated
export const codRemittanceStatusEnum = pgEnum('cod_remittance_status', [
  'pending', // COD collected, awaiting wallet credit
  'credited', // Amount credited to merchant wallet
])

/**
 * COD Remittances Table - SIMPLIFIED VERSION
 * Tracks individual COD order remittances from courier to merchant
 */
export const codRemittances = pgTable('cod_remittances', {
  id: uuid('id').primaryKey().defaultRandom(),

  // User reference
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),

  // Order references
  orderId: uuid('order_id').notNull(),
  orderType: varchar('order_type', { length: 10 }).notNull(), // 'b2c' | 'b2b'
  orderNumber: varchar('order_number', { length: 50 }).notNull(),
  awbNumber: varchar('awb_number', { length: 100 }),

  // Courier info
  courierPartner: varchar('courier_partner', { length: 50 }),

  // Financial details
  codAmount: decimal('cod_amount', { precision: 12, scale: 2 }).notNull(), // Total COD collected
  codCharges: decimal('cod_charges', { precision: 12, scale: 2 }).default('0').notNull(),
  shippingCharges: decimal('shipping_charges', { precision: 12, scale: 2 }).default('0').notNull(),
  deductions: decimal('deductions', { precision: 12, scale: 2 }).default('0').notNull(),
  remittableAmount: decimal('remittable_amount', { precision: 12, scale: 2 }).notNull(),

  // Remittance tracking
  status: codRemittanceStatusEnum('status').default('pending').notNull(),
  collectedAt: timestamp('collected_at'),
  creditedAt: timestamp('credited_at'), // When credited to wallet

  // Wallet transaction reference
  walletTransactionId: uuid('wallet_transaction_id'),
  notes: text('notes'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})
