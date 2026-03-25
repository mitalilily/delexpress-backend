"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceDisputes = exports.invoiceDisputeStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const billingInvoices_1 = require("./billingInvoices");
const users_1 = require("./users");
exports.invoiceDisputeStatusEnum = (0, pg_core_1.pgEnum)('invoice_dispute_status', [
    'open',
    'in_review',
    'resolved',
    'rejected',
]);
exports.invoiceDisputes = (0, pg_core_1.pgTable)('invoice_disputes', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => billingInvoices_1.billingInvoices.id, { onDelete: 'cascade' }),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    status: (0, exports.invoiceDisputeStatusEnum)('status').default('open').notNull(),
    subject: (0, pg_core_1.varchar)('subject', { length: 140 }).notNull(),
    details: (0, pg_core_1.text)('details'),
    lineItemRef: (0, pg_core_1.varchar)('line_item_ref', { length: 120 }), // optional specific AWB or item id
    resolutionNotes: (0, pg_core_1.text)('resolution_notes'),
    resolvedBy: (0, pg_core_1.uuid)('resolved_by').references(() => users_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
