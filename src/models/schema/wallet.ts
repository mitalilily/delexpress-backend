// db/schema/wallet.ts
import { jsonb, numeric, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const topupStatusEnum = pgEnum('wallet_topup_status', [
  'created',
  'processing',
  'success',
  'failed',
])
export const txnTypeEnum = pgEnum('wallet_txn_type', ['credit', 'debit'])

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  balance: numeric('balance', { precision: 14, scale: 2 }).default('0.00'),
  currency: varchar('currency', { length: 3 }).default('INR'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
})

export const walletTopups = pgTable('wallet_topups', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('walletId')
    .references(() => wallets.id, {
      onDelete: 'cascade',
    })
    .notNull(),
  gateway: varchar('gateway', { length: 20 }).default('razorpay').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 })
    .$type<number>() // 👈 add this
    .notNull(),
  currency: varchar('currency', { length: 3 }).default('INR'),
  status: topupStatusEnum('status').default('created'),
  gatewayOrderId: varchar('gatewayOrderId', { length: 64 }),
  gatewayPaymentId: varchar('gatewayPaymentId', { length: 64 }),
  meta: jsonb('meta'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
})

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  wallet_id: uuid('wallet_id') // snake_case
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).$type<number>().notNull(),
  currency: varchar('currency', { length: 3 }).default('INR'),
  type: txnTypeEnum('type').notNull(), // credit or debit
  ref: varchar('ref', { length: 64 }),
  reason: varchar('reason', { length: 128 }),
  meta: jsonb('meta'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
