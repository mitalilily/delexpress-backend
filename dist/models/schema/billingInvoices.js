"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingInvoices = exports.billingInvoiceTypeEnum = exports.invoiceStatusEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.invoiceStatusEnum = (0, pg_core_1.pgEnum)('invoice_status', ['pending', 'paid', 'disputed']);
exports.billingInvoiceTypeEnum = (0, pg_core_1.pgEnum)('billingInvoiceTypeEnum', [
    'weekly',
    'monthly_summary',
    'manual',
]);
exports.billingInvoices = (0, pg_core_1.pgTable)('billingInvoices', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    invoiceNo: (0, pg_core_1.varchar)('invoice_no', { length: 50 }).notNull().unique(),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    billingStart: (0, pg_core_1.date)('billing_start').notNull(),
    billingEnd: (0, pg_core_1.date)('billing_end').notNull(),
    taxableValue: (0, pg_core_1.decimal)('taxable_value', { precision: 12, scale: 2 }).default('0'),
    cgst: (0, pg_core_1.decimal)('cgst', { precision: 12, scale: 2 }).default('0'),
    sgst: (0, pg_core_1.decimal)('sgst', { precision: 12, scale: 2 }).default('0'),
    igst: (0, pg_core_1.decimal)('igst', { precision: 12, scale: 2 }).default('0'),
    totalAmount: (0, pg_core_1.decimal)('total_amount', { precision: 12, scale: 2 }).default('0'),
    gstRate: (0, pg_core_1.integer)('gst_rate').default(18),
    status: (0, exports.invoiceStatusEnum)('status').default('pending').notNull(),
    type: (0, exports.billingInvoiceTypeEnum)('type').default('weekly').notNull(),
    pdfUrl: (0, pg_core_1.text)('pdf_url').notNull(), // GST tax invoice (human readable)
    csvUrl: (0, pg_core_1.text)('csv_url').notNull(), // detailed bifurcation file
    orderNumbers: (0, pg_core_1.jsonb)('order_numbers').$type(), // Store order numbers for quick reference
    isDisputed: (0, pg_core_1.boolean)('is_disputed').default(false),
    remarks: (0, pg_core_1.text)('remarks'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
