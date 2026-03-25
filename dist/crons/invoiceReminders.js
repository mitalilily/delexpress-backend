"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUnpaidInvoiceReminders = sendUnpaidInvoiceReminders;
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const emailSender_1 = require("../utils/emailSender");
// Send reminders for unpaid invoices older than N days
async function sendUnpaidInvoiceReminders({ olderThanDays = 7 } = {}) {
    const cutoff = (0, dayjs_1.default)().subtract(olderThanDays, 'day').toDate();
    const rows = await client_1.db
        .select({
        id: schema_1.billingInvoices.id,
        invoiceNo: schema_1.billingInvoices.invoiceNo,
        sellerId: schema_1.billingInvoices.sellerId,
        totalAmount: schema_1.billingInvoices.totalAmount,
        createdAt: schema_1.billingInvoices.createdAt,
        pdfUrl: schema_1.billingInvoices.pdfUrl,
        csvUrl: schema_1.billingInvoices.csvUrl,
    })
        .from(schema_1.billingInvoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.billingInvoices.status, 'pending'), (0, drizzle_orm_1.gt)(schema_1.billingInvoices.createdAt, cutoff)));
    for (const inv of rows) {
        // fetch email
        const [u] = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, inv.sellerId)).limit(1);
        const email = u?.email;
        if (!email)
            continue;
        try {
            await (0, emailSender_1.sendInvoiceReminderEmail)({
                to: email,
                invoiceNo: inv.invoiceNo,
                amount: Number(inv.totalAmount || 0),
                pdfUrl: inv.pdfUrl,
                csvUrl: inv.csvUrl,
            });
            // eslint-disable-next-line no-console
            console.log(`📧 Sent reminder for invoice ${inv.invoiceNo} to ${email}`);
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.error('Failed to send reminder', inv.invoiceNo, e);
        }
    }
}
