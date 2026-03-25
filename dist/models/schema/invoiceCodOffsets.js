"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceCodOffsets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const billingInvoices_1 = require("./billingInvoices");
const codRemittance_1 = require("./codRemittance");
const users_1 = require("./users");
exports.invoiceCodOffsets = (0, pg_core_1.pgTable)('invoice_cod_offsets', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    invoiceId: (0, pg_core_1.uuid)('invoice_id')
        .notNull()
        .references(() => billingInvoices_1.billingInvoices.id, { onDelete: 'cascade' }),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    codRemittanceId: (0, pg_core_1.uuid)('cod_remittance_id')
        .notNull()
        .references(() => codRemittance_1.codRemittances.id, { onDelete: 'cascade' }),
    amount: (0, pg_core_1.decimal)('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
