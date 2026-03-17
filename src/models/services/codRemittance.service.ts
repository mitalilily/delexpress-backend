import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { billingInvoices, invoiceCodOffsets } from '../../schema/schema'
import { db } from '../client'
import { codRemittances } from '../schema/codRemittance'
import { wallets } from '../schema/wallet'
import { getInvoiceStatement } from './invoiceStatement.service'
import { createWalletTransaction } from './wallet.service'

/**
 * Create a COD remittance entry when an order is delivered with COD
 * DOES NOT automatically credit wallet - waits for actual courier settlement
 * Real-world flow: Order delivered → Create pending remittance → Wait for courier to settle
 */
export async function createCodRemittance(params: {
  orderId: string
  orderType: 'b2c' | 'b2b'
  userId: string
  orderNumber: string
  awbNumber?: string
  courierPartner?: string
  codAmount: number
  codCharges: number
  freightCharges: number
  collectedAt?: Date
}): Promise<{ remittance: any; created: boolean }> {
  const {
    orderId,
    orderType,
    userId,
    orderNumber,
    awbNumber,
    courierPartner,
    codAmount,
    codCharges,
    freightCharges,
    collectedAt,
  } = params

  // COD remittance should deduct merchant-facing platform charges, not customer-facing label charges.
  const normalizedFreightCharges = Number(freightCharges)
  const deductions = Number(codCharges) + normalizedFreightCharges
  const remittableAmount = Number(codAmount) - deductions

  // Idempotency guard: delivered webhooks can be retried.
  const [existingRemittance] = await db
    .select()
    .from(codRemittances)
    .where(
      and(
        eq(codRemittances.userId, userId),
        eq(codRemittances.orderId, orderId),
        eq(codRemittances.orderType, orderType),
      ),
    )
    .limit(1)

  if (existingRemittance) {
    console.log(
      `ℹ️ COD remittance already exists for order ${orderNumber} (status: ${existingRemittance.status})`,
    )
    return { remittance: existingRemittance, created: false }
  }

  // Create remittance entry with PENDING status
  const [remittance] = await db
    .insert(codRemittances)
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
      notes: `COD collected by ${
        courierPartner || 'courier'
      }. Awaiting settlement from courier partner.`,
    })
    .returning()

  console.log(
    `📦 COD Remittance created (PENDING): ₹${remittableAmount} for order ${orderNumber}. Waiting for courier settlement.`,
  )

  return { remittance, created: true }
}

/**
 * Credit wallet when courier actually settles the payment
 * Called manually by admin or automatically via settlement reconciliation
 */
export async function creditCodRemittanceToWallet(params: {
  remittanceId: string
  settledDate?: Date
  utrNumber?: string
  settledAmount?: number
  notes?: string
  creditedBy?: string // admin user ID
}) {
  const { remittanceId, settledDate, utrNumber, settledAmount, notes, creditedBy } = params

  return await db
    .transaction(async (tx) => {
      // 1. Get the remittance
      const [remittance] = await tx
        .select()
        .from(codRemittances)
        .where(eq(codRemittances.id, remittanceId))

      if (!remittance) {
        throw new Error(`Remittance not found: ${remittanceId}`)
      }

      if (remittance.status === 'credited') {
        throw new Error(`Remittance already credited: ${remittance.orderNumber}`)
      }

      // 2. Get user's wallet
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, remittance.userId))

      if (!wallet) {
        throw new Error(`Wallet not found for user ${remittance.userId}`)
      }

      // 3. Determine amount to credit (use settled amount if different from original)
      const amountToCredit =
        settledAmount !== undefined ? Number(settledAmount) : Number(remittance.remittableAmount)

      if (!Number.isFinite(amountToCredit) || amountToCredit <= 0) {
        throw new Error('Invalid settled amount. Amount to credit must be greater than 0.')
      }

      // 4. Credit wallet
      const [walletTxn] = await createWalletTransaction({
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
        tx: tx as any,
      })

      // 5. Update remittance status to credited
      const adminNote = creditedBy
        ? `Manually credited by admin (ID: ${creditedBy}). `
        : 'Auto-credited via settlement reconciliation. '
      const fullNotes = `${adminNote}${notes || ''} ${utrNumber ? `UTR: ${utrNumber}` : ''}`

      const [updatedRemittance] = await tx
        .update(codRemittances)
        .set({
          status: 'credited',
          creditedAt: settledDate || new Date(),
          walletTransactionId: walletTxn?.id,
          notes: fullNotes.trim(),
          updatedAt: new Date(),
        })
        .where(eq(codRemittances.id, remittance.id))
        .returning()

      // 6. Auto-create COD offsets for pending invoices (optional automation)
      let autoOffsetInvoiceId: string | null = null
      try {
        const pendingInvoices = await tx
          .select()
          .from(billingInvoices)
          .where(
            and(
              eq(billingInvoices.sellerId, remittance.userId),
              eq(billingInvoices.status, 'pending' as any),
            ),
          )
          .orderBy(billingInvoices.createdAt) // oldest first

        // Check if any offset already exists for this remittance
        const [existingOffset] = await tx
          .select()
          .from(invoiceCodOffsets)
          .where(eq(invoiceCodOffsets.codRemittanceId, remittance.id))
          .limit(1)

        if (!existingOffset && pendingInvoices.length > 0) {
          // Auto-apply to oldest pending invoice
          const targetInvoice = pendingInvoices[0]
          await tx.insert(invoiceCodOffsets).values({
            invoiceId: targetInvoice.id,
            sellerId: remittance.userId,
            codRemittanceId: remittance.id,
            amount: amountToCredit.toString(),
          })
          autoOffsetInvoiceId = targetInvoice.id
          console.log(
            `💰 Auto-created COD offset: ₹${amountToCredit} for invoice ${targetInvoice.invoiceNo}`,
          )
        }
      } catch (offsetErr) {
        // Don't fail the credit transaction if offset creation fails
        console.error('Failed to auto-create COD offset:', offsetErr)
      }

      console.log(
        `✅ COD Remittance credited to wallet: ₹${amountToCredit} for order ${remittance.orderNumber}`,
      )

      return { updatedRemittance, autoOffsetInvoiceId }
    })
    .then(async (result) => {
      // After transaction commits, check if invoice should be auto-marked as paid
      if (result.autoOffsetInvoiceId) {
        try {
          const stmt = await getInvoiceStatement(result.autoOffsetInvoiceId)
          if (stmt.outstanding <= 0) {
            const [inv] = await db
              .select()
              .from(billingInvoices)
              .where(eq(billingInvoices.id, result.autoOffsetInvoiceId))
              .limit(1)
            if (inv && inv.status !== 'paid') {
              await db
                .update(billingInvoices)
                .set({ status: 'paid', updatedAt: new Date() })
                .where(eq(billingInvoices.id, result.autoOffsetInvoiceId))
              console.log(`✅ Auto-marked invoice ${inv.invoiceNo} as paid (outstanding = 0)`)
            }
          }
        } catch (err) {
          // Don't fail if auto-paid check fails
          console.error('Failed to auto-mark invoice as paid:', err)
        }
      }
      return result.updatedRemittance
    })
}

/**
 * Get all COD remittances for a user with filters
 */
export async function getCodRemittances(
  userId: string,
  filters: {
    status?: string
    fromDate?: Date
    toDate?: Date
    page?: number
    limit?: number
  } = {},
) {
  const { status, fromDate, toDate, page = 1, limit = 20 } = filters
  const offset = (page - 1) * limit

  const conditions = [eq(codRemittances.userId, userId)]

  if (status) {
    conditions.push(eq(codRemittances.status, status as any))
  }

  if (fromDate) {
    conditions.push(gte(codRemittances.collectedAt, fromDate))
  }

  if (toDate) {
    conditions.push(lte(codRemittances.collectedAt, toDate))
  }

  const remittances = await db
    .select()
    .from(codRemittances)
    .where(and(...conditions))
    .orderBy(desc(codRemittances.createdAt))
    .limit(limit)
    .offset(offset)

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(codRemittances)
    .where(and(...conditions))

  return {
    remittances,
    totalCount: Number(countResult?.count || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
  }
}

/**
 * Get COD remittance statistics for a user
 */
export async function getCodRemittanceStats(userId: string) {
  // Total credited remittances (Remitted Till Date)
  const [creditedStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
    })
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'credited')))

  // Total pending remittances (Next Remittance/Total Due)
  const [pendingStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
    })
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'pending')))

  // Get last credited remittance
  const [lastRemittance] = await db
    .select()
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'credited')))
    .orderBy(desc(codRemittances.creditedAt))
    .limit(1)

  return {
    remittedTillDate: Number(creditedStats?.totalAmount || 0),
    lastRemittance: lastRemittance ? Number(lastRemittance.remittableAmount) : 0,
    nextRemittance: Number(pendingStats?.totalAmount || 0),
    totalDue: Number(pendingStats?.totalAmount || 0),
    // Additional info
    creditedCount: Number(creditedStats?.count || 0),
    pendingCount: Number(pendingStats?.count || 0),
  }
}

/**
 * Update remittance notes (status is auto-managed)
 */
export async function updateCodRemittanceNotes(remittanceId: string, notes: string) {
  const [updated] = await db
    .update(codRemittances)
    .set({
      notes,
      updatedAt: new Date(),
    })
    .where(eq(codRemittances.id, remittanceId))
    .returning()

  return updated
}

/**
 * Get COD dashboard summary
 */
export async function getCodDashboardSummary(userId: string) {
  const stats = await getCodRemittanceStats(userId)

  // Get recent remittances
  const recentRemittances = await db
    .select()
    .from(codRemittances)
    .where(eq(codRemittances.userId, userId))
    .orderBy(desc(codRemittances.createdAt))
    .limit(10)

  return {
    stats,
    recentRemittances,
  }
}
