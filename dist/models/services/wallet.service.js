"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserWalletTransactions = exports.createWalletTransaction = void 0;
exports.mutateBalance = mutateBalance;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const wallet_1 = require("../schema/wallet");
/**
 * Inserts a wallet transaction and updates the wallet balance accordingly.
 */
const createWalletTransaction = async ({ walletId, amount, type, reason, ref, meta, currency = 'INR', tx, }) => {
    // Use provided transaction or default to db
    const executor = tx ?? client_1.db;
    const wallet = await executor.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, walletId)).limit(1);
    const currentBalance = Number(wallet[0]?.balance ?? 0);
    // Get current wallet balance if debit
    if (type === 'debit') {
        if (!wallet[0])
            throw new Error('Wallet not found');
        if (currentBalance < Number(amount)) {
            throw new Error('Insufficient wallet balance');
        }
        await executor
            .update(wallet_1.wallets)
            .set({ balance: (currentBalance - Number(amount)).toString() })
            .where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, walletId));
    }
    else if (type === 'credit') {
        // For credit, just increment
        await executor
            .update(wallet_1.wallets)
            .set({
            balance: (currentBalance + Number(amount)).toString(),
        })
            .where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, walletId));
    }
    // Insert transaction record
    const result = await executor
        .insert(wallet_1.walletTransactions)
        .values({
        wallet_id: walletId,
        amount,
        type,
        reason,
        ref,
        meta,
        currency,
        created_at: new Date(),
    })
        .returning({ id: wallet_1.walletTransactions.id });
    return result;
};
exports.createWalletTransaction = createWalletTransaction;
async function mutateBalance(walletId, amount, type, ref, meta = {}, reason = 'Wallet operation') {
    const delta = type === 'credit' ? amount : -amount;
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(wallet_1.wallets)
            .set({
            balance: (0, drizzle_orm_1.sql) `${wallet_1.wallets.balance} + ${delta}`,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, walletId));
        await (0, exports.createWalletTransaction)({
            walletId: walletId,
            amount,
            currency: 'INR',
            type,
            ref,
            reason,
            meta,
            tx: tx,
        });
    });
}
/**
 * Fetch wallet transactions for a given user.
 */
const getUserWalletTransactions = async ({ userId, limit = 50, offset = 0, type, dateFrom, dateTo, }) => {
    // 1️⃣ Get wallet of the user
    const userWallet = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
    if (!userWallet[0]) {
        throw new Error('Wallet not found for this user');
    }
    // 2️⃣ Build dynamic where clause
    let filter = (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, userWallet[0].id);
    if (type || dateFrom || dateTo) {
        const conditions = [(0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, userWallet[0].id)];
        if (type)
            conditions.push((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, type));
        if (dateFrom)
            conditions.push((0, drizzle_orm_1.gte)(wallet_1.walletTransactions.created_at, dateFrom));
        if (dateTo)
            conditions.push((0, drizzle_orm_1.lte)(wallet_1.walletTransactions.created_at, dateTo));
        filter = (0, drizzle_orm_1.and)(...conditions);
    }
    // 3️⃣ Fetch transactions
    const transactions = await client_1.db
        .select()
        .from(wallet_1.walletTransactions)
        .where(filter)
        .orderBy((0, drizzle_orm_1.sql) `${wallet_1.walletTransactions.created_at} DESC`)
        .limit(limit)
        .offset(offset);
    return {
        wallet: userWallet[0],
        transactions,
    };
};
exports.getUserWalletTransactions = getUserWalletTransactions;
