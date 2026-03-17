import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../client'
import { wallets, walletTransactions } from '../schema/wallet'

type WalletTransactionType = 'credit' | 'debit'

interface WalletTransactionParams {
  walletId: string
  amount: number
  type: WalletTransactionType
  reason?: string
  ref?: string
  meta?: Record<string, any>
  currency?: string
  tx?: PgTransaction<any> // optional, for passing an existing transaction
}

/**
 * Inserts a wallet transaction and updates the wallet balance accordingly.
 */
export const createWalletTransaction = async ({
  walletId,
  amount,
  type,
  reason,
  ref,
  meta,
  currency = 'INR',
  tx,
}: WalletTransactionParams) => {
  // Use provided transaction or default to db
  const executor = tx ?? db

  const wallet = await executor.select().from(wallets).where(eq(wallets.id, walletId)).limit(1)
  const currentBalance = Number(wallet[0]?.balance ?? 0)
  // Get current wallet balance if debit
  if (type === 'debit') {
    if (!wallet[0]) throw new Error('Wallet not found')
    if (currentBalance < Number(amount)) {
      throw new Error('Insufficient wallet balance')
    }

    await executor
      .update(wallets)
      .set({ balance: (currentBalance - Number(amount)).toString() })
      .where(eq(wallets.id, walletId))
  } else if (type === 'credit') {
    // For credit, just increment
    await executor
      .update(wallets)
      .set({
        balance: (currentBalance + Number(amount)).toString(),
      })
      .where(eq(wallets.id, walletId))
  }

  // Insert transaction record
  const result = await executor
    .insert(walletTransactions)
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
    .returning({ id: walletTransactions.id })

  return result
}

export async function mutateBalance(
  walletId: string,
  amount: number,
  type: 'credit' | 'debit',
  ref: string,
  meta: Record<string, unknown> = {},
  reason = 'Wallet operation',
) {
  const delta = type === 'credit' ? amount : -amount

  await db.transaction(async (tx) => {
    await tx
      .update(wallets)
      .set({
        balance: sql`${wallets.balance} + ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
    await createWalletTransaction({
      walletId: walletId,
      amount,
      currency: 'INR',
      type,
      ref,
      reason,
      meta,
      tx: tx as any,
    })
  })
}

interface GetUserWalletTransactionsParams {
  userId: string
  limit?: number
  offset?: number
  type?: 'credit' | 'debit'
  dateFrom?: Date
  dateTo?: Date
}

/**
 * Fetch wallet transactions for a given user.
 */
export const getUserWalletTransactions = async ({
  userId,
  limit = 50,
  offset = 0,
  type,
  dateFrom,
  dateTo,
}: GetUserWalletTransactionsParams) => {
  // 1️⃣ Get wallet of the user
  const userWallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  if (!userWallet[0]) {
    throw new Error('Wallet not found for this user')
  }
  // 2️⃣ Build dynamic where clause
  let filter: any = eq(walletTransactions.wallet_id, userWallet[0].id)
  if (type || dateFrom || dateTo) {
    const conditions: any[] = [eq(walletTransactions.wallet_id, userWallet[0].id)]
    if (type) conditions.push(eq(walletTransactions.type, type))
    if (dateFrom) conditions.push(gte(walletTransactions.created_at, dateFrom))
    if (dateTo) conditions.push(lte(walletTransactions.created_at, dateTo))
    filter = and(...conditions)
  }

  // 3️⃣ Fetch transactions
  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(filter)
    .orderBy(sql`${walletTransactions.created_at} DESC`)
    .limit(limit)
    .offset(offset)

  return {
    wallet: userWallet[0],
    transactions,
  }
}
