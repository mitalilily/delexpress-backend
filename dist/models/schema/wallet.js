"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTransactions = exports.walletTopups = exports.wallets = exports.txnTypeEnum = exports.topupStatusEnum = void 0;
// db/schema/wallet.ts
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.topupStatusEnum = (0, pg_core_1.pgEnum)('wallet_topup_status', [
    'created',
    'processing',
    'success',
    'failed',
]);
exports.txnTypeEnum = (0, pg_core_1.pgEnum)('wallet_txn_type', ['credit', 'debit']);
exports.wallets = (0, pg_core_1.pgTable)('wallets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('userId')
        .notNull()
        .unique()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    balance: (0, pg_core_1.numeric)('balance', { precision: 14, scale: 2 }).default('0.00'),
    currency: (0, pg_core_1.varchar)('currency', { length: 3 }).default('INR'),
    createdAt: (0, pg_core_1.timestamp)('createdAt', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updatedAt', { withTimezone: true }).defaultNow(),
});
exports.walletTopups = (0, pg_core_1.pgTable)('wallet_topups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    walletId: (0, pg_core_1.uuid)('walletId')
        .references(() => exports.wallets.id, {
        onDelete: 'cascade',
    })
        .notNull(),
    gateway: (0, pg_core_1.varchar)('gateway', { length: 20 }).default('razorpay').notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 })
        .$type() // 👈 add this
        .notNull(),
    currency: (0, pg_core_1.varchar)('currency', { length: 3 }).default('INR'),
    status: (0, exports.topupStatusEnum)('status').default('created'),
    gatewayOrderId: (0, pg_core_1.varchar)('gatewayOrderId', { length: 64 }),
    gatewayPaymentId: (0, pg_core_1.varchar)('gatewayPaymentId', { length: 64 }),
    meta: (0, pg_core_1.jsonb)('meta'),
    createdAt: (0, pg_core_1.timestamp)('createdAt', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updatedAt', { withTimezone: true }).defaultNow(),
});
exports.walletTransactions = (0, pg_core_1.pgTable)('wallet_transactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    wallet_id: (0, pg_core_1.uuid)('wallet_id') // snake_case
        .notNull()
        .references(() => exports.wallets.id, { onDelete: 'cascade' }),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 }).$type().notNull(),
    currency: (0, pg_core_1.varchar)('currency', { length: 3 }).default('INR'),
    type: (0, exports.txnTypeEnum)('type').notNull(), // credit or debit
    ref: (0, pg_core_1.varchar)('ref', { length: 64 }),
    reason: (0, pg_core_1.varchar)('reason', { length: 128 }),
    meta: (0, pg_core_1.jsonb)('meta'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow(),
});
