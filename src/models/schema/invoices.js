"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoices = exports.invoiceType = exports.invoiceStatus = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var users_1 = require("./users");
// Enum for invoice status
exports.invoiceStatus = (0, pg_core_1.pgEnum)('invoice_status', ['paid', 'pending', 'overdue']);
exports.invoiceType = (0, pg_core_1.pgEnum)('invoice_type', ['b2b', 'b2c']);
// --------------------
// INVOICES (Single Table)
// --------------------
exports.invoices = (0, pg_core_1.pgTable)('invoices', {
    id: (0, pg_core_1.integer)('id').primaryKey(),
    userId: (0, pg_core_1.uuid)('userId')
        .notNull()
        .references(function () { return users_1.users.id; }, { onDelete: 'cascade' }),
    type: (0, exports.invoiceType)('type').notNull().default('b2c'),
    invoiceNumber: (0, pg_core_1.varchar)('invoice_number', { length: 50 }).notNull(),
    billingPeriodFrom: (0, pg_core_1.date)('billing_period_from').notNull(),
    billingPeriodTo: (0, pg_core_1.date)('billing_period_to').notNull(),
    link: (0, pg_core_1.varchar)('link', { length: 150 }).notNull(),
    totalOrders: (0, pg_core_1.integer)('total_orders').notNull().default(0),
    invoiceDate: (0, pg_core_1.date)('invoice_date').notNull(),
    netPayableAmount: (0, pg_core_1.numeric)('net_payable_amount', { precision: 12, scale: 2 }).notNull(),
    status: (0, exports.invoiceStatus)('status').notNull().default('pending'),
    // 🧾 All order details (per order charges, taxes, etc.) stored here
    items: (0, pg_core_1.jsonb)('items').notNull().$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
