"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceAdjustments = exports.invoiceAdjustmentTypeEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const billingInvoices_1 = require("./billingInvoices");
const users_1 = require("./users");
exports.invoiceAdjustmentTypeEnum = (0, pg_core_1.pgEnum)('invoice_adjustment_type', [
    'credit',
    'debit',
    'waiver',
    'surcharge',
]);
exports.invoiceAdjustments = (0, pg_core_1.pgTable)('invoice_adjustments', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => billingInvoices_1.billingInvoices.id, { onDelete: 'cascade' }),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    type: (0, exports.invoiceAdjustmentTypeEnum)('type').notNull(),
    amount: (0, pg_core_1.decimal)('amount', { precision: 12, scale: 2 }).notNull(),
    reason: (0, pg_core_1.text)('reason'),
    // Mark if this adjustment has been applied/processed
    // This prevents double-counting when adjustments are accepted or payments are made
    isApplied: (0, pg_core_1.boolean)('is_applied').default(false).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
