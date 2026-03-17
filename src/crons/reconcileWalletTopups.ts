/**
 * Reconcile missed Razorpay wallet top‑ups.
 * Uses:  razorpayApi (Axios → /v1/orders) + Drizzle ORM
 */

import { eq, sql } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../models/client'
import { walletOfUser } from '../models/services/walletTopupService'
import { wallets, walletTopups, walletTransactions } from '../schema/schema'
import { razorpayApi } from '../utils/razorpay' // ← Axios client

/* ─────────────── Razorpay types we actually use ─────────────── */
interface RazorpayOrder {
  id: string
  amount: number
  currency: string
  status: string // "created" | "paid" | ...
  notes?: Record<string, string>
}

interface RazorpayPayment {
  id: string
  status: string // "created" | "captured" | ...
  method: string
  email?: string
  contact?: string
}

interface OrdersResponse {
  entity: 'collection'
  count: number
  items: RazorpayOrder[]
}

interface PaymentsResponse {
  entity: 'collection'
  count: number
  items: RazorpayPayment[]
}
/* ─────────────────────────────────────────────────────────────── */

export async function reconcileWalletTopups(): Promise<void> {
  const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 60 * 60

  /* 1️⃣  GET /v1/orders?status=paid */
  const { data: ordersRes } = await razorpayApi.get<OrdersResponse>('/orders', {
    params: {
      from: threeHoursAgo,
      count: 100,
    },
  })

  const orders = ordersRes.items
  console.log(`[Cron] Scanning ${orders.length} paid orders …`)

  for (const order of orders) {
    /* 2️⃣  Process only wallet top‑ups */
    const userId = order.notes?.userId as string | undefined
    const description = order.notes?.description
    if (!userId || description !== 'Wallet Top-up') continue

    /* 3️⃣  Skip if already credited */
    const creditedAlready =
      (
        await db
          .select({ id: walletTopups.id })
          .from(walletTopups)
          .where(eq(walletTopups.gatewayOrderId, order.id))
          .limit(1)
      ).length > 0
    if (creditedAlready) continue

    /* 4️⃣  GET /v1/orders/{orderId}/payments */
    const { data: paymentsRes } = await razorpayApi.get<PaymentsResponse>(
      `/orders/${order.id}/payments`,
    )
    const payment = paymentsRes.items.find((p) => p.status === 'captured')
    if (!payment) continue

    /* 5️⃣  Credit inside a DB transaction */
    await db.transaction(async (tx) => {
      const wallet = await walletOfUser(userId, tx)
      const amount = order.amount / 100 // paise → ₹
      const topupId = crypto.randomUUID()

      // A. wallet_topups
      await tx.insert(walletTopups).values({
        id: topupId,
        walletId: wallet.id,
        amount,
        currency: order.currency,
        status: 'success',
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        gatewayPaymentId: payment.id,
        meta: { email: payment.email, contact: payment.contact },
      })

      // B. wallets.balance
      await tx
        .update(wallets)
        .set({ balance: sql`balance + ${amount}` })
        .where(eq(wallets.id, wallet.id))

      // C. wallet_transactions
      await tx.insert(walletTransactions).values({
        wallet_id: wallet.id,
        amount,
        currency: order.currency,
        type: 'credit',
        ref: payment.id,
        reason: 'wallet_topup',
        meta: { topupId, method: payment.method, email: payment.email },
      })
    })

    console.log(`[Cron] ✅ Credited ₹${order.amount / 100} to user ${userId} (order ${order.id})`)
  }

  console.log('[Cron] Wallet reconciliation complete ✅')
}
