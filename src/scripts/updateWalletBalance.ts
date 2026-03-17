// scripts/updateWalletBalance.ts

import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { wallets, walletTransactions } from '../schema/schema'

/**
 * Updates a user's wallet balance
 * @param userId - UUID of the user
 * @param amount - Amount to update (positive for credit, negative for debit)
 * @param reason - Reason for the transaction
 */
export async function updateWalletBalance(userId: string, amount: number, reason: string) {
  // Fetch the wallet
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId))

  if (!wallet) throw new Error(`Wallet not found for user ${userId}`)

  const newBalance = Number(wallet.balance) + amount
  if (newBalance < 0) throw new Error('Insufficient balance')

  // Update balance
  await db.update(wallets).set({ balance: newBalance?.toString() }).where(eq(wallets.id, wallet.id))

  // Insert transaction
  await db.insert(walletTransactions).values({
    wallet_id: wallet.id,
    amount: Math.abs(amount),
    type: amount >= 0 ? 'credit' : 'debit',
    reason,
    currency: wallet.currency,
    created_at: new Date(),
  })

  console.log(
    `✅ Wallet updated for user ${userId}. New balance: ${newBalance.toFixed(2)} ${
      wallet.currency
    }`,
  )
}
// Example usage
if (require.main === module) {
  const [userId, amountStr, reason] = process.argv.slice(2)
  const amount = Number(amountStr)

  if (!userId || isNaN(amount) || !reason) {
    console.error('Usage: ts-node updateWalletBalance.ts <userId> <amount> <reason>')
    process.exit(1)
  }

  updateWalletBalance(userId, amount, reason)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
