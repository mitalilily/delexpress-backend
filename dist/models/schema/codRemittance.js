"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codRemittances = exports.codRemittanceStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
// COD Remittance Status - Wallet Integrated
exports.codRemittanceStatusEnum = (0, pg_core_1.pgEnum)('cod_remittance_status', [
    'pending', // COD collected, awaiting wallet credit
    'credited', // Amount credited to merchant wallet
]);
/**
 * COD Remittances Table - SIMPLIFIED VERSION
 * Tracks individual COD order remittances from courier to merchant
 */
exports.codRemittances = (0, pg_core_1.pgTable)('cod_remittances', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // User reference
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    // Order references
    orderId: (0, pg_core_1.uuid)('order_id').notNull(),
    orderType: (0, pg_core_1.varchar)('order_type', { length: 10 }).notNull(), // 'b2c' | 'b2b'
    orderNumber: (0, pg_core_1.varchar)('order_number', { length: 50 }).notNull(),
    awbNumber: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    // Courier info
    courierPartner: (0, pg_core_1.varchar)('courier_partner', { length: 50 }),
    // Financial details
    codAmount: (0, pg_core_1.decimal)('cod_amount', { precision: 12, scale: 2 }).notNull(), // Total COD collected
    codCharges: (0, pg_core_1.decimal)('cod_charges', { precision: 12, scale: 2 }).default('0').notNull(),
    shippingCharges: (0, pg_core_1.decimal)('shipping_charges', { precision: 12, scale: 2 }).default('0').notNull(),
    deductions: (0, pg_core_1.decimal)('deductions', { precision: 12, scale: 2 }).default('0').notNull(),
    remittableAmount: (0, pg_core_1.decimal)('remittable_amount', { precision: 12, scale: 2 }).notNull(),
    // Remittance tracking
    status: (0, exports.codRemittanceStatusEnum)('status').default('pending').notNull(),
    collectedAt: (0, pg_core_1.timestamp)('collected_at'),
    creditedAt: (0, pg_core_1.timestamp)('credited_at'), // When credited to wallet
    // Wallet transaction reference
    walletTransactionId: (0, pg_core_1.uuid)('wallet_transaction_id'),
    notes: (0, pg_core_1.text)('notes'),
    // Timestamps
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
