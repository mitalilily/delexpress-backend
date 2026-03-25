"use strict";
/**
 * Reconcile missed Razorpay wallet top‑ups.
 * Uses:  razorpayApi (Axios → /v1/orders) + Drizzle ORM
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileWalletTopups = reconcileWalletTopups;
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = __importDefault(require("node:crypto"));
const client_1 = require("../models/client");
const walletTopupService_1 = require("../models/services/walletTopupService");
const schema_1 = require("../schema/schema");
const razorpay_1 = require("../utils/razorpay"); // ← Axios client
/* ─────────────────────────────────────────────────────────────── */
async function reconcileWalletTopups() {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 60 * 60;
    /* 1️⃣  GET /v1/orders?status=paid */
    const { data: ordersRes } = await razorpay_1.razorpayApi.get('/orders', {
        params: {
            from: threeHoursAgo,
            count: 100,
        },
    });
    const orders = ordersRes.items;
    console.log(`[Cron] Scanning ${orders.length} paid orders …`);
    for (const order of orders) {
        /* 2️⃣  Process only wallet top‑ups */
        const userId = order.notes?.userId;
        const description = order.notes?.description;
        if (!userId || description !== 'Wallet Top-up')
            continue;
        /* 3️⃣  Skip if already credited */
        const creditedAlready = (await client_1.db
            .select({ id: schema_1.walletTopups.id })
            .from(schema_1.walletTopups)
            .where((0, drizzle_orm_1.eq)(schema_1.walletTopups.gatewayOrderId, order.id))
            .limit(1)).length > 0;
        if (creditedAlready)
            continue;
        /* 4️⃣  GET /v1/orders/{orderId}/payments */
        const { data: paymentsRes } = await razorpay_1.razorpayApi.get(`/orders/${order.id}/payments`);
        const payment = paymentsRes.items.find((p) => p.status === 'captured');
        if (!payment)
            continue;
        /* 5️⃣  Credit inside a DB transaction */
        await client_1.db.transaction(async (tx) => {
            const wallet = await (0, walletTopupService_1.walletOfUser)(userId, tx);
            const amount = order.amount / 100; // paise → ₹
            const topupId = node_crypto_1.default.randomUUID();
            // A. wallet_topups
            await tx.insert(schema_1.walletTopups).values({
                id: topupId,
                walletId: wallet.id,
                amount,
                currency: order.currency,
                status: 'success',
                gateway: 'razorpay',
                gatewayOrderId: order.id,
                gatewayPaymentId: payment.id,
                meta: { email: payment.email, contact: payment.contact },
            });
            // B. wallets.balance
            await tx
                .update(schema_1.wallets)
                .set({ balance: (0, drizzle_orm_1.sql) `balance + ${amount}` })
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.id, wallet.id));
            // C. wallet_transactions
            await tx.insert(schema_1.walletTransactions).values({
                wallet_id: wallet.id,
                amount,
                currency: order.currency,
                type: 'credit',
                ref: payment.id,
                reason: 'wallet_topup',
                meta: { topupId, method: payment.method, email: payment.email },
            });
        });
        console.log(`[Cron] ✅ Credited ₹${order.amount / 100} to user ${userId} (order ${order.id})`);
    }
    console.log('[Cron] Wallet reconciliation complete ✅');
}
