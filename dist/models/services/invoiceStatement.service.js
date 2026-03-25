"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoiceStatement = getInvoiceStatement;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const billingInvoices_1 = require("../schema/billingInvoices");
const invoiceAdjustments_1 = require("../schema/invoiceAdjustments");
const invoiceCodOffsets_1 = require("../schema/invoiceCodOffsets");
const invoiceDisputes_1 = require("../schema/invoiceDisputes");
const invoicePayments_1 = require("../schema/invoicePayments");
const upload_service_1 = require("./upload.service");
const toNumber = (v) => Number(v || 0);
async function getInvoiceStatement(invoiceId, requestingUserId) {
    const [inv] = await client_1.db
        .select()
        .from(billingInvoices_1.billingInvoices)
        .where((0, drizzle_orm_1.eq)(billingInvoices_1.billingInvoices.id, invoiceId))
        .limit(1);
    if (!inv)
        throw new Error('Invoice not found');
    if (requestingUserId && inv.sellerId !== requestingUserId) {
        // Optional caller-side enforcement; route should also enforce auth
        throw new Error('Forbidden');
    }
    const [adjRows, payRows, codRows, disputeRows] = await Promise.all([
        client_1.db.select().from(invoiceAdjustments_1.invoiceAdjustments).where((0, drizzle_orm_1.eq)(invoiceAdjustments_1.invoiceAdjustments.invoiceId, inv.id)),
        client_1.db.select().from(invoicePayments_1.invoicePayments).where((0, drizzle_orm_1.eq)(invoicePayments_1.invoicePayments.invoiceId, inv.id)),
        client_1.db.select().from(invoiceCodOffsets_1.invoiceCodOffsets).where((0, drizzle_orm_1.eq)(invoiceCodOffsets_1.invoiceCodOffsets.invoiceId, inv.id)),
        client_1.db
            .select({
            id: invoiceDisputes_1.invoiceDisputes.id,
            status: invoiceDisputes_1.invoiceDisputes.status,
            subject: invoiceDisputes_1.invoiceDisputes.subject,
        })
            .from(invoiceDisputes_1.invoiceDisputes)
            .where((0, drizzle_orm_1.eq)(invoiceDisputes_1.invoiceDisputes.invoiceId, inv.id)),
    ]);
    // Filter out adjustments that are already applied (prevents double-counting)
    const activeAdjustments = adjRows.filter((a) => !a.isApplied);
    // Base totals
    const taxableValue = toNumber(inv.taxableValue);
    const cgst = toNumber(inv.cgst);
    const sgst = toNumber(inv.sgst);
    const igst = toNumber(inv.igst);
    const netPayable = toNumber(inv.totalAmount);
    // Adjustments grouped (only count non-applied adjustments to prevent double-counting)
    let credits = 0, debits = 0, waivers = 0, surcharges = 0;
    for (const a of activeAdjustments) {
        const amt = toNumber(a.amount);
        if (a.type === 'credit')
            credits += amt;
        else if (a.type === 'debit')
            debits += amt;
        else if (a.type === 'waiver')
            waivers += amt;
        else if (a.type === 'surcharge')
            surcharges += amt;
    }
    const adjustmentsTotal = -credits + debits - waivers + surcharges;
    // Payments
    let paymentsReceived = 0;
    const methodMap = new Map();
    for (const p of payRows) {
        const amt = toNumber(p.amount);
        paymentsReceived += amt;
        methodMap.set(p.method, (methodMap.get(p.method) || 0) + amt);
    }
    const paymentBreakdown = Array.from(methodMap.entries()).map(([method, amount]) => ({
        method,
        amount,
    }));
    // COD Offsets
    const codOffsets = codRows.reduce((acc, r) => acc + toNumber(r.amount), 0);
    // Calculate outstanding
    // Formula: baseAmount + adjustmentsTotal - paymentsReceived - codOffsets
    // Where adjustmentsTotal = -credits + debits - waivers + surcharges
    // This means credits and waivers reduce what's owed (negative impact)
    // Debits and surcharges increase what's owed (positive impact)
    const outstanding = Math.max(0, netPayable + adjustmentsTotal - paymentsReceived - codOffsets);
    // Ensure outstanding cannot be negative (credits/waivers can't overpay)
    // If outstanding becomes negative due to credits/waivers and payments, it should be 0
    const finalOutstanding = Math.max(0, outstanding);
    // Infer wallet payment for display if invoice is paid but no explicit payments/offsets exist
    if (inv.status === 'paid' && paymentsReceived === 0 && codOffsets === 0 && outstanding === 0) {
        const inferred = Math.max(0, netPayable + adjustmentsTotal);
        if (inferred > 0) {
            paymentsReceived = inferred;
            const existingWallet = methodMap.get('wallet') || 0;
            methodMap.set('wallet', existingWallet + inferred);
        }
    }
    // Adjustment history (sorted by date, newest first) - show all adjustments, including applied ones
    const adjustmentHistory = adjRows
        .map((a) => ({
        id: a.id,
        type: a.type,
        amount: toNumber(a.amount),
        reason: a.reason || null,
        isApplied: a.isApplied || false,
        createdAt: a.createdAt || new Date(),
        createdBy: a.createdBy || null,
    }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    // Presign PDF and CSV URLs
    let pdfUrl = undefined;
    let csvUrl = undefined;
    try {
        if (inv.pdfUrl) {
            const presignedPdf = await (0, upload_service_1.presignDownload)(inv.pdfUrl);
            pdfUrl = Array.isArray(presignedPdf)
                ? presignedPdf.length > 0
                    ? presignedPdf[0]
                    : undefined
                : presignedPdf || undefined;
        }
        if (inv.csvUrl) {
            const presignedCsv = await (0, upload_service_1.presignDownload)(inv.csvUrl);
            csvUrl = Array.isArray(presignedCsv)
                ? presignedCsv.length > 0
                    ? presignedCsv[0]
                    : undefined
                : presignedCsv || undefined;
        }
    }
    catch (err) {
        console.error(`Failed to presign URLs for invoice ${inv.invoiceNo}:`, err);
    }
    const statement = {
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        sellerId: inv.sellerId,
        period: { from: inv.billingStart, to: inv.billingEnd },
        links: { pdf: pdfUrl, csv: csvUrl },
        status: inv.status,
        totals: {
            netPayable,
            taxBreakup: { cgst, sgst, igst },
            taxableValue,
        },
        additions: { adjustments: adjustmentsTotal, debits, credits, surcharges, waivers },
        offsets: { codOffsets },
        payments: { received: paymentsReceived, breakdown: paymentBreakdown },
        outstanding: finalOutstanding,
        disputes: disputeRows.map((d) => ({ id: d.id, status: d.status, subject: d.subject })),
        adjustmentHistory,
    };
    return statement;
}
