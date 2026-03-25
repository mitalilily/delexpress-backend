"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoicePayments = exports.invoicePaymentMethodEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const billingInvoices_1 = require("./billingInvoices");
const users_1 = require("./users");
exports.invoicePaymentMethodEnum = (0, pg_core_1.pgEnum)('invoice_payment_method', [
    'upi',
    'neft',
    'pg',
    'wallet',
]);
exports.invoicePayments = (0, pg_core_1.pgTable)('invoice_payments', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => billingInvoices_1.billingInvoices.id, { onDelete: 'cascade' }),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    method: (0, exports.invoicePaymentMethodEnum)('method').notNull(),
    amount: (0, pg_core_1.decimal)('amount', { precision: 12, scale: 2 }).notNull(),
    reference: (0, pg_core_1.varchar)('reference', { length: 120 }),
    notes: (0, pg_core_1.text)('notes'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
