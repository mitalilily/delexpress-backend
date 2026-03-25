"use strict";
// scripts/updateWalletBalance.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWalletBalance = updateWalletBalance;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
/**
 * Updates a user's wallet balance
 * @param userId - UUID of the user
 * @param amount - Amount to update (positive for credit, negative for debit)
 * @param reason - Reason for the transaction
 */
async function updateWalletBalance(userId, amount, reason) {
    // Fetch the wallet
    const [wallet] = await client_1.db.select().from(schema_1.wallets).where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, userId));
    if (!wallet)
        throw new Error(`Wallet not found for user ${userId}`);
    const newBalance = Number(wallet.balance) + amount;
    if (newBalance < 0)
        throw new Error('Insufficient balance');
    // Update balance
    await client_1.db.update(schema_1.wallets).set({ balance: newBalance?.toString() }).where((0, drizzle_orm_1.eq)(schema_1.wallets.id, wallet.id));
    // Insert transaction
    await client_1.db.insert(schema_1.walletTransactions).values({
        wallet_id: wallet.id,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'credit' : 'debit',
        reason,
        currency: wallet.currency,
        created_at: new Date(),
    });
    console.log(`✅ Wallet updated for user ${userId}. New balance: ${newBalance.toFixed(2)} ${wallet.currency}`);
}
// Example usage
if (require.main === module) {
    const [userId, amountStr, reason] = process.argv.slice(2);
    const amount = Number(amountStr);
    if (!userId || isNaN(amount) || !reason) {
        console.error('Usage: ts-node updateWalletBalance.ts <userId> <amount> <reason>');
        process.exit(1);
    }
    updateWalletBalance(userId, amount, reason)
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
