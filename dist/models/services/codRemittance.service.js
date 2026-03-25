"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCodRemittance = createCodRemittance;
exports.creditCodRemittanceToWallet = creditCodRemittanceToWallet;
exports.getCodRemittances = getCodRemittances;
exports.getCodRemittanceStats = getCodRemittanceStats;
exports.updateCodRemittanceNotes = updateCodRemittanceNotes;
exports.getCodDashboardSummary = getCodDashboardSummary;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../schema/schema");
const client_1 = require("../client");
const codRemittance_1 = require("../schema/codRemittance");
const wallet_1 = require("../schema/wallet");
const invoiceStatement_service_1 = require("./invoiceStatement.service");
const wallet_service_1 = require("./wallet.service");
/**
 * Create a COD remittance entry when an order is delivered with COD
 * DOES NOT automatically credit wallet - waits for actual courier settlement
 * Real-world flow: Order delivered → Create pending remittance → Wait for courier to settle
 */
async function createCodRemittance(params) {
    const { orderId, orderType, userId, orderNumber, awbNumber, courierPartner, codAmount, codCharges, freightCharges, collectedAt, } = params;
    // COD remittance should deduct merchant-facing platform charges, not customer-facing label charges.
    const normalizedFreightCharges = Number(freightCharges);
    const deductions = Number(codCharges) + normalizedFreightCharges;
    const remittableAmount = Number(codAmount) - deductions;
    // Idempotency guard: delivered webhooks can be retried.
    const [existingRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.orderId, orderId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.orderType, orderType)))
        .limit(1);
    if (existingRemittance) {
        console.log(`ℹ️ COD remittance already exists for order ${orderNumber} (status: ${existingRemittance.status})`);
        return { remittance: existingRemittance, created: false };
    }
    // Create remittance entry with PENDING status
    const [remittance] = await client_1.db
        .insert(codRemittance_1.codRemittances)
        .values({
        userId,
        orderId,
        orderType,
        orderNumber,
        awbNumber: awbNumber || null,
        courierPartner: courierPartner || null,
        codAmount: codAmount.toString(),
        codCharges: codCharges.toString(),
        // Legacy column name; stores freight/platform deduction amount for COD settlement math.
        shippingCharges: normalizedFreightCharges.toString(),
        deductions: deductions.toString(),
        remittableAmount: remittableAmount.toString(),
        status: 'pending', // ✅ PENDING - waiting for courier settlement
        collectedAt: collectedAt || new Date(),
        notes: `COD collected by ${courierPartner || 'courier'}. Awaiting settlement from courier partner.`,
    })
        .returning();
    console.log(`📦 COD Remittance created (PENDING): ₹${remittableAmount} for order ${orderNumber}. Waiting for courier settlement.`);
    return { remittance, created: true };
}
/**
 * Credit wallet when courier actually settles the payment
 * Called manually by admin or automatically via settlement reconciliation
 */
async function creditCodRemittanceToWallet(params) {
    const { remittanceId, settledDate, utrNumber, settledAmount, notes, creditedBy } = params;
    return await client_1.db
        .transaction(async (tx) => {
        // 1. Get the remittance
        const [remittance] = await tx
            .select()
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId));
        if (!remittance) {
            throw new Error(`Remittance not found: ${remittanceId}`);
        }
        if (remittance.status === 'credited') {
            throw new Error(`Remittance already credited: ${remittance.orderNumber}`);
        }
        // 2. Get user's wallet
        const [wallet] = await tx.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, remittance.userId));
        if (!wallet) {
            throw new Error(`Wallet not found for user ${remittance.userId}`);
        }
        // 3. Determine amount to credit (use settled amount if different from original)
        const amountToCredit = settledAmount !== undefined ? Number(settledAmount) : Number(remittance.remittableAmount);
        if (!Number.isFinite(amountToCredit) || amountToCredit <= 0) {
            throw new Error('Invalid settled amount. Amount to credit must be greater than 0.');
        }
        // 4. Credit wallet
        const [walletTxn] = await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount: amountToCredit,
            type: 'credit',
            reason: `COD Settlement - Order #${remittance.orderNumber}`,
            ref: remittance.orderId,
            meta: {
                remittanceId: remittance.id,
                codAmount: Number(remittance.codAmount),
                deductions: Number(remittance.deductions),
                courierPartner: remittance.courierPartner || 'Unknown',
                utrNumber: utrNumber || null,
                creditedBy: creditedBy || 'system',
                settledAmount: settledAmount || null,
            },
            tx: tx,
        });
        // 5. Update remittance status to credited
        const adminNote = creditedBy
            ? `Manually credited by admin (ID: ${creditedBy}). `
            : 'Auto-credited via settlement reconciliation. ';
        const fullNotes = `${adminNote}${notes || ''} ${utrNumber ? `UTR: ${utrNumber}` : ''}`;
        const [updatedRemittance] = await tx
            .update(codRemittance_1.codRemittances)
            .set({
            status: 'credited',
            creditedAt: settledDate || new Date(),
            walletTransactionId: walletTxn?.id,
            notes: fullNotes.trim(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittance.id))
            .returning();
        // 6. Auto-create COD offsets for pending invoices (optional automation)
        let autoOffsetInvoiceId = null;
        try {
            const pendingInvoices = await tx
                .select()
                .from(schema_1.billingInvoices)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.billingInvoices.sellerId, remittance.userId), (0, drizzle_orm_1.eq)(schema_1.billingInvoices.status, 'pending')))
                .orderBy(schema_1.billingInvoices.createdAt); // oldest first
            // Check if any offset already exists for this remittance
            const [existingOffset] = await tx
                .select()
                .from(schema_1.invoiceCodOffsets)
                .where((0, drizzle_orm_1.eq)(schema_1.invoiceCodOffsets.codRemittanceId, remittance.id))
                .limit(1);
            if (!existingOffset && pendingInvoices.length > 0) {
                // Auto-apply to oldest pending invoice
                const targetInvoice = pendingInvoices[0];
                await tx.insert(schema_1.invoiceCodOffsets).values({
                    invoiceId: targetInvoice.id,
                    sellerId: remittance.userId,
                    codRemittanceId: remittance.id,
                    amount: amountToCredit.toString(),
                });
                autoOffsetInvoiceId = targetInvoice.id;
                console.log(`💰 Auto-created COD offset: ₹${amountToCredit} for invoice ${targetInvoice.invoiceNo}`);
            }
        }
        catch (offsetErr) {
            // Don't fail the credit transaction if offset creation fails
            console.error('Failed to auto-create COD offset:', offsetErr);
        }
        console.log(`✅ COD Remittance credited to wallet: ₹${amountToCredit} for order ${remittance.orderNumber}`);
        return { updatedRemittance, autoOffsetInvoiceId };
    })
        .then(async (result) => {
        // After transaction commits, check if invoice should be auto-marked as paid
        if (result.autoOffsetInvoiceId) {
            try {
                const stmt = await (0, invoiceStatement_service_1.getInvoiceStatement)(result.autoOffsetInvoiceId);
                if (stmt.outstanding <= 0) {
                    const [inv] = await client_1.db
                        .select()
                        .from(schema_1.billingInvoices)
                        .where((0, drizzle_orm_1.eq)(schema_1.billingInvoices.id, result.autoOffsetInvoiceId))
                        .limit(1);
                    if (inv && inv.status !== 'paid') {
                        await client_1.db
                            .update(schema_1.billingInvoices)
                            .set({ status: 'paid', updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.billingInvoices.id, result.autoOffsetInvoiceId));
                        console.log(`✅ Auto-marked invoice ${inv.invoiceNo} as paid (outstanding = 0)`);
                    }
                }
            }
            catch (err) {
                // Don't fail if auto-paid check fails
                console.error('Failed to auto-mark invoice as paid:', err);
            }
        }
        return result.updatedRemittance;
    });
}
/**
 * Get all COD remittances for a user with filters
 */
async function getCodRemittances(userId, filters = {}) {
    const { status, fromDate, toDate, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId)];
    if (status) {
        conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, status));
    }
    if (fromDate) {
        conditions.push((0, drizzle_orm_1.gte)(codRemittance_1.codRemittances.collectedAt, fromDate));
    }
    if (toDate) {
        conditions.push((0, drizzle_orm_1.lte)(codRemittance_1.codRemittances.collectedAt, toDate));
    }
    const remittances = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
        .limit(limit)
        .offset(offset);
    const [countResult] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)(...conditions));
    return {
        remittances,
        totalCount: Number(countResult?.count || 0),
        page,
        limit,
        totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
    };
}
/**
 * Get COD remittance statistics for a user
 */
async function getCodRemittanceStats(userId) {
    // Total credited remittances (Remitted Till Date)
    const [creditedStats] = await client_1.db
        .select({
        count: (0, drizzle_orm_1.sql) `count(*)`,
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited')));
    // Total pending remittances (Next Remittance/Total Due)
    const [pendingStats] = await client_1.db
        .select({
        count: (0, drizzle_orm_1.sql) `count(*)`,
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'pending')));
    // Get last credited remittance
    const [lastRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited')))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.creditedAt))
        .limit(1);
    return {
        remittedTillDate: Number(creditedStats?.totalAmount || 0),
        lastRemittance: lastRemittance ? Number(lastRemittance.remittableAmount) : 0,
        nextRemittance: Number(pendingStats?.totalAmount || 0),
        totalDue: Number(pendingStats?.totalAmount || 0),
        // Additional info
        creditedCount: Number(creditedStats?.count || 0),
        pendingCount: Number(pendingStats?.count || 0),
    };
}
/**
 * Update remittance notes (status is auto-managed)
 */
async function updateCodRemittanceNotes(remittanceId, notes) {
    const [updated] = await client_1.db
        .update(codRemittance_1.codRemittances)
        .set({
        notes,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId))
        .returning();
    return updated;
}
/**
 * Get COD dashboard summary
 */
async function getCodDashboardSummary(userId) {
    const stats = await getCodRemittanceStats(userId);
    // Get recent remittances
    const recentRemittances = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
        .limit(10);
    return {
        stats,
        recentRemittances,
    };
}
