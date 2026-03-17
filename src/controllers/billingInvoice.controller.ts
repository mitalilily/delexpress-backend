import { and, between, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import { billingInvoices } from '../models/schema/billingInvoices'
import { codRemittances } from '../models/schema/codRemittance'
import { invoiceAdjustments } from '../models/schema/invoiceAdjustments'
import { invoiceCodOffsets } from '../models/schema/invoiceCodOffsets'
import { invoiceDisputes } from '../models/schema/invoiceDisputes'
import { invoicePayments } from '../models/schema/invoicePayments'
import { userProfiles } from '../models/schema/userProfile'
import { wallets } from '../models/schema/wallet'
import {
  generateInvoiceForUser,
  regenerateInvoiceWithAdjustments,
} from '../models/services/invoiceGeneration.service'
import { getInvoiceStatement } from '../models/services/invoiceStatement.service'
import { presignDownload } from '../models/services/upload.service'

const getFilenameFromKey = (value: string | null | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value)
    const pathParts = url.pathname.split('/').filter(Boolean)
    return pathParts[pathParts.length - 1] || null
  } catch {
    const parts = value.split('/').filter(Boolean)
    return parts[parts.length - 1] || null
  }
}
import { createWalletTransaction } from '../models/services/wallet.service'

const parseLocalDateBoundary = (
  input: string,
  boundary: 'start' | 'end',
): Date | null => {
  const raw = String(input || '').trim()
  if (!raw) return null

  // Treat plain YYYY-MM-DD as local calendar date (avoids UTC date shift).
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const year = Number(m[1])
    const monthIndex = Number(m[2]) - 1
    const day = Number(m[3])
    const d = new Date(year, monthIndex, day)
    if (Number.isNaN(d.getTime())) return null
    if (boundary === 'start') d.setHours(0, 0, 0, 0)
    else d.setHours(23, 59, 59, 999)
    return d
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  if (boundary === 'start') d.setHours(0, 0, 0, 0)
  else d.setHours(23, 59, 59, 999)
  return d
}

const formatDateYmdLocal = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const BILLABLE_STATUSES = [
  'shipment_created',
  'booked',
  'pickup_initiated',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'ndr',
  'rto',
  'rto_in_transit',
  'rto_delivered',
] as const

const getBillableOrderNumbersForRange = async (sellerId: string, start: Date, end: Date) => {
  const [b2cRows, b2bRows] = await Promise.all([
    db
      .select({ orderNumber: b2c_orders.order_number })
      .from(b2c_orders)
      .where(
        and(
          eq(b2c_orders.user_id, sellerId),
          between(b2c_orders.created_at, start, end),
          inArray(b2c_orders.order_status, [...BILLABLE_STATUSES]),
        ),
      ),
    db
      .select({ orderNumber: b2b_orders.order_number })
      .from(b2b_orders)
      .where(
        and(
          eq(b2b_orders.user_id, sellerId),
          between(b2b_orders.created_at, start, end),
          inArray(b2b_orders.order_status, [...BILLABLE_STATUSES]),
        ),
      ),
  ])

  return Array.from(
    new Set(
      [...b2cRows, ...b2bRows]
        .map((r) => String(r.orderNumber || '').trim())
        .filter(Boolean),
    ),
  )
}

const findDuplicateInvoiceByOrderNumbers = async (sellerId: string, candidateOrderNumbers: string[]) => {
  if (!candidateOrderNumbers.length) return null

  const candidateSet = new Set(candidateOrderNumbers)
  const existing = await db
    .select({
      id: billingInvoices.id,
      invoiceNo: billingInvoices.invoiceNo,
      billingStart: billingInvoices.billingStart,
      billingEnd: billingInvoices.billingEnd,
      orderNumbers: billingInvoices.orderNumbers,
    })
    .from(billingInvoices)
    .where(eq(billingInvoices.sellerId, sellerId))

  for (const inv of existing) {
    const orderNumbers = Array.isArray(inv.orderNumbers)
      ? inv.orderNumbers
      : typeof inv.orderNumbers === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(inv.orderNumbers)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })()
      : []

    const overlap = orderNumbers
      .map((v: unknown) => String(v || '').trim())
      .filter((v: string) => v.length > 0 && candidateSet.has(v))

    if (overlap.length > 0) {
      return {
        invoiceNo: inv.invoiceNo,
        billingStart: inv.billingStart,
        billingEnd: inv.billingEnd,
        overlapCount: overlap.length,
        sampleOrderNumber: overlap[0],
      }
    }
  }

  return null
}

export async function listBillingInvoices(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { page = '1', limit = '20', status } = req.query as any
    const p = Math.max(1, parseInt(page, 10))
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)))

    const whereClauses: any[] = [eq(billingInvoices.sellerId, userId)]
    if (status) whereClauses.push(eq(billingInvoices.status, status))

    const offset = (p - 1) * l

    const data = await db
      .select()
      .from(billingInvoices)
      .where(whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses))
      .orderBy(desc(billingInvoices.createdAt))
      .limit(l)
      .offset(offset)

    const total = (
      await db
        .select({ count: sql<number>`count(*)` })
        .from(billingInvoices)
        .where(whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses))
    )[0].count as number

    // Presign PDF and CSV URLs for all invoices
    const dataWithPresignedUrls = await Promise.all(
      data.map(async (invoice) => {
        try {
          const pdfUrl = invoice.pdfUrl ? await presignDownload(invoice.pdfUrl) : null
          const csvFilename = getFilenameFromKey(invoice.csvUrl) || 'invoice.csv'
          const csvUrl = invoice.csvUrl
            ? await presignDownload(invoice.csvUrl, {
                downloadName: csvFilename,
                disposition: 'attachment',
                contentType: 'text/csv',
              })
            : null
          return {
            ...invoice,
            pdfUrl: Array.isArray(pdfUrl) ? (pdfUrl.length > 0 ? pdfUrl[0] : null) : pdfUrl,
            csvUrl: Array.isArray(csvUrl) ? (csvUrl.length > 0 ? csvUrl[0] : null) : csvUrl,
          }
        } catch (err) {
          console.error(`Failed to presign URLs for invoice ${invoice.invoiceNo}:`, err)
          return invoice
        }
      }),
    )

    return res.json({
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l),
      data: dataWithPresignedUrls,
    })
  } catch (err: any) {
    console.error('❌ listBillingInvoices error', {
      userId: req?.user?.sub,
      query: req?.query,
      message: err?.message,
      stack: err?.stack,
    })
    return res.status(400).json({ error: err.message })
  }
}

export async function getBillingInvoiceStatement(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { id } = req.params
    const data = await getInvoiceStatement(id, userId)
    const response = { ...data }
    if (response.outstanding === 0 && response.status !== 'paid') {
      response.status = 'paid'
    } else if (response.outstanding > 0 && response.status === 'paid') {
      response.status = 'pending'
    }
    return res.json(response)
  } catch (err: any) {
    console.error('❌ getBillingInvoiceStatement error', {
      userId: req?.user?.sub,
      params: req?.params,
      message: err?.message,
      stack: err?.stack,
    })
    return res.status(400).json({ error: err.message })
  }
}

export async function adminListBillingInvoices(req: any, res: Response) {
  try {
    const { page = '1', limit = '20', sellerId, status } = req.query as any
    const p = Math.max(1, parseInt(page, 10))
    const l = Math.min(100, Math.max(1, parseInt(limit, 10)))

    const whereClauses: any[] = []
    if (sellerId) whereClauses.push(eq(billingInvoices.sellerId, sellerId))
    if (status) whereClauses.push(eq(billingInvoices.status, status))

    const offset = (p - 1) * l
    const whereCondition = whereClauses.length
      ? whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses)
      : undefined

    const [dataResult, totalResult] = await Promise.all([
      db
        .select({
          id: billingInvoices.id,
          invoiceNo: billingInvoices.invoiceNo,
          sellerId: billingInvoices.sellerId,
          billingStart: billingInvoices.billingStart,
          billingEnd: billingInvoices.billingEnd,
          taxableValue: billingInvoices.taxableValue,
          cgst: billingInvoices.cgst,
          sgst: billingInvoices.sgst,
          igst: billingInvoices.igst,
          totalAmount: billingInvoices.totalAmount,
          gstRate: billingInvoices.gstRate,
          status: billingInvoices.status,
          type: billingInvoices.type,
          pdfUrl: billingInvoices.pdfUrl,
          csvUrl: billingInvoices.csvUrl,
          isDisputed: billingInvoices.isDisputed,
          remarks: billingInvoices.remarks,
          createdAt: billingInvoices.createdAt,
          updatedAt: billingInvoices.updatedAt,
          sellerName: sql<string>`coalesce(${userProfiles.companyInfo} ->> 'businessName', ${userProfiles.companyInfo} ->> 'brandName')`,
        })
        .from(billingInvoices)
        .leftJoin(userProfiles, eq(userProfiles.userId, billingInvoices.sellerId))
        .where(whereCondition)
        .orderBy(desc(billingInvoices.createdAt))
        .limit(l)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(billingInvoices)
        .where(whereCondition),
    ])

    const totalCount = Number(totalResult[0]?.count || 0)

    // Presign PDF and CSV URLs for all invoices
    const dataWithPresignedUrls = await Promise.all(
      dataResult.map(async (invoice) => {
        try {
          const pdfUrl = invoice.pdfUrl ? await presignDownload(invoice.pdfUrl) : null
          const csvFilename = getFilenameFromKey(invoice.csvUrl) || 'invoice.csv'
          const csvUrl = invoice.csvUrl
            ? await presignDownload(invoice.csvUrl, {
                downloadName: csvFilename,
                disposition: 'attachment',
                contentType: 'text/csv',
              })
            : null
          return {
            ...invoice,
            pdfUrl: Array.isArray(pdfUrl) ? (pdfUrl.length > 0 ? pdfUrl[0] : null) : pdfUrl,
            csvUrl: Array.isArray(csvUrl) ? (csvUrl.length > 0 ? csvUrl[0] : null) : csvUrl,
          }
        } catch (err) {
          console.error(`Failed to presign URLs for invoice ${invoice.invoiceNo}:`, err)
          return invoice
        }
      }),
    )

    return res.json({
      page: p,
      limit: l,
      total: totalCount,
      totalPages: Math.ceil(totalCount / l),
      data: dataWithPresignedUrls,
    })
  } catch (err: any) {
    console.error('❌ adminListBillingInvoices error', {
      adminId: req?.user?.sub,
      query: req?.query,
      message: err?.message,
      stack: err?.stack,
    })
    return res.status(400).json({ error: err.message })
  }
}

export async function addInvoiceAdjustment(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { id } = req.params
    const { type, amount, reason } = req.body

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv || inv.sellerId !== userId) return res.status(404).json({ error: 'Invoice not found' })

    await db.transaction(async (tx) => {
      await tx
        .insert(invoiceAdjustments)
        .values({ invoiceId: id, sellerId: userId, type, amount, reason, createdBy: userId })
    })

    // Check and auto-mark paid if outstanding = 0 (after transaction commits)
    const stmt = await getInvoiceStatement(id)
    // Check if there are unapplied credits/waivers
    const hasUnappliedCreditsWaivers = stmt.additions.credits > 0 || stmt.additions.waivers > 0

    // If outstanding <= 0 AND no unapplied credits/waivers, mark as paid
    // If outstanding <= 0 BUT has unapplied credits/waivers, keep as pending
    if (stmt.outstanding <= 0 && !hasUnappliedCreditsWaivers && inv.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
    } else if ((stmt.outstanding > 0 || hasUnappliedCreditsWaivers) && inv.status === 'paid') {
      // If a debit created dues after being marked paid, or if there are unapplied credits/waivers, downgrade to pending
      await db
        .update(billingInvoices)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
    }

    const finalStmt = await getInvoiceStatement(id)
    return res.json({ statement: finalStmt })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function recordInvoicePayment(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { id } = req.params
    const { method, amount, reference, notes } = req.body

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv || inv.sellerId !== userId) return res.status(404).json({ error: 'Invoice not found' })

    await db.transaction(async (tx) => {
      // If wallet payment, debit wallet
      if (method === 'wallet') {
        const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
        if (!wallet) throw new Error('Wallet not found')

        const currentBalance = Number(wallet.balance || 0)
        const paymentAmount = Number(amount)
        if (currentBalance < paymentAmount) {
          throw new Error('Insufficient wallet balance')
        }

        await createWalletTransaction({
          walletId: wallet.id,
          amount: paymentAmount,
          type: 'debit',
          reason: 'invoice_payment',
          ref: id,
          meta: { invoiceNo: inv.invoiceNo, reference, notes },
          tx: tx as any,
        })
      }

      // Record payment
      await tx.insert(invoicePayments).values({
        invoiceId: id,
        sellerId: userId,
        method,
        amount,
        reference,
        notes,
      })

      // Mark any pending credit/waiver adjustments as applied when payment is made
      // This ensures credits/waivers are only counted once
      await tx
        .update(invoiceAdjustments)
        .set({ isApplied: true, updatedAt: new Date() })
        .where(
          and(
            eq(invoiceAdjustments.invoiceId, id),
            eq(invoiceAdjustments.sellerId, userId),
            sql`${invoiceAdjustments.type} IN ('credit', 'waiver')`,
            sql`${invoiceAdjustments.isApplied} = false`,
          ),
        )
    })

    // Regenerate invoice with adjustments after payment
    try {
      await regenerateInvoiceWithAdjustments(id)
    } catch (regenerateErr: any) {
      console.error('Failed to regenerate invoice:', regenerateErr)
      // Don't fail the request if regeneration fails
    }

    // Recalculate statement AFTER regeneration to ensure outstanding is accurate
    const stmt = await getInvoiceStatement(id)
    if (stmt.outstanding <= 0 && inv.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      stmt.status = 'paid'
    } else if (stmt.outstanding > 0 && inv.status === 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      stmt.status = 'pending'
    }

    // Get final statement after status update
    const finalStmt = await getInvoiceStatement(id)

    return res.json({ statement: finalStmt })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function raiseInvoiceDispute(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { id } = req.params
    const { subject, details, lineItemRef } = req.body

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv || inv.sellerId !== userId) return res.status(404).json({ error: 'Invoice not found' })

    const [row] = await db
      .insert(invoiceDisputes)
      .values({ invoiceId: id, sellerId: userId, subject, details, lineItemRef })
      .returning()

    // Optional: mark invoice disputed
    await db
      .update(billingInvoices)
      .set({ isDisputed: true, updatedAt: new Date() })
      .where(eq(billingInvoices.id, id))

    return res.json(row)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

// Admin: resolve dispute / add COD offset / close invoice
export async function adminAddCodOffset(req: any, res: Response) {
  try {
    const { id } = req.params
    const { codRemittanceId, amount } = req.body

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    // Get current outstanding first
    const currentStmt = await getInvoiceStatement(id)
    const currentOutstanding = Number(currentStmt.outstanding || 0)
    if (currentOutstanding <= 0) {
      return res.status(400).json({ error: 'No outstanding to offset' })
    }

    const [remit] = await db
      .select()
      .from(codRemittances)
      .where(eq(codRemittances.id, codRemittanceId))
      .limit(1)

    if (!remit || remit.userId !== inv.sellerId)
      return res.status(400).json({ error: 'Invalid COD remittance' })

    // Cap applied amount to outstanding
    const requestedAmount = Number(amount)
    const applyAmount = Math.max(0, Math.min(requestedAmount, currentOutstanding))
    if (applyAmount <= 0) {
      return res.status(400).json({ error: 'Offset amount must be > 0 and not exceed outstanding' })
    }

    await db.insert(invoiceCodOffsets).values({
      invoiceId: id,
      sellerId: inv.sellerId,
      codRemittanceId,
      amount: applyAmount,
    } as any)

    // Check and auto-mark paid if outstanding = 0
    const stmt = await getInvoiceStatement(id)
    // Check if there are unapplied credits/waivers
    const hasUnappliedCreditsWaivers = stmt.additions.credits > 0 || stmt.additions.waivers > 0

    // If outstanding <= 0 AND no unapplied credits/waivers, mark as paid
    // If outstanding <= 0 BUT has unapplied credits/waivers, keep as pending
    if (stmt.outstanding <= 0 && !hasUnappliedCreditsWaivers && inv.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
    } else if ((stmt.outstanding > 0 || hasUnappliedCreditsWaivers) && inv.status === 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
    }

    const finalStmt = await getInvoiceStatement(id)
    return res.json({ statement: finalStmt })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function adminResolveDispute(req: any, res: Response) {
  try {
    const adminId = req.user.sub
    const { disputeId } = req.params
    const { status, resolutionNotes } = req.body

    // Fetch dispute to get associated invoiceId
    const [existing] = await db
      .select()
      .from(invoiceDisputes)
      .where(eq(invoiceDisputes.id, disputeId))
      .limit(1)

    if (!existing) {
      return res.status(404).json({ error: 'Dispute not found' })
    }

    const [row] = await db
      .update(invoiceDisputes)
      .set({ status, resolutionNotes, resolvedBy: adminId, updatedAt: new Date() })
      .where(eq(invoiceDisputes.id, disputeId))
      .returning()

    // If no remaining open/in_review disputes for the invoice, unset isDisputed on invoice
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoiceDisputes)
      .where(
        and(
          eq(invoiceDisputes.invoiceId, (existing as any).invoiceId),
          or(
            eq(invoiceDisputes.status, 'open' as any),
            eq(invoiceDisputes.status, 'in_review' as any),
          ),
        ),
      )

    if (Number(count) === 0) {
      await db
        .update(billingInvoices)
        .set({ isDisputed: false, updatedAt: new Date() })
        .where(eq(billingInvoices.id, (existing as any).invoiceId))
    }

    return res.json(row)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function adminCloseInvoice(req: any, res: Response) {
  try {
    const { id } = req.params
    const statement = await getInvoiceStatement(id)
    if (statement.outstanding > 0) return res.status(400).json({ error: 'Outstanding exists' })

    const [row] = await db
      .update(billingInvoices)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(billingInvoices.id, id))
      .returning()

    return res.json(row)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function adminRegenerateInvoice(req: any, res: Response) {
  try {
    const { id } = req.params

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    // Reset manual adjustments as part of regenerate-reset flow.
    const removedAdjustments = await db
      .delete(invoiceAdjustments)
      .where(eq(invoiceAdjustments.invoiceId, id))
      .returning({ id: invoiceAdjustments.id })

    await regenerateInvoiceWithAdjustments(id)

    const [updatedInvoice] = await db
      .update(billingInvoices)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(billingInvoices.id, id))
      .returning()

    const statement = await getInvoiceStatement(id)

    return res.json({
      success: true,
      message: `Invoice regenerated, status reset to pending, and ${removedAdjustments.length} adjustment(s) cleared`,
      invoice: updatedInvoice,
      statement,
    })
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to regenerate invoice' })
  }
}

export async function getInvoiceDisputes(req: any, res: Response) {
  try {
    const { id } = req.params
    const disputes = await db
      .select()
      .from(invoiceDisputes)
      .where(eq(invoiceDisputes.invoiceId, id))
      .orderBy(desc(invoiceDisputes.createdAt))

    return res.json({ disputes })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

// Admin: record payment on behalf of user
export async function adminRecordInvoicePayment(req: any, res: Response) {
  try {
    const { id } = req.params
    const { method, amount, reference, notes } = req.body

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    await db.transaction(async (tx) => {
      // If wallet payment, debit wallet
      if (method === 'wallet') {
        const [wallet] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.userId, inv.sellerId))
          .limit(1)
        if (!wallet) throw new Error('Wallet not found')

        const currentBalance = Number(wallet.balance || 0)
        const paymentAmount = Number(amount)
        if (currentBalance < paymentAmount) {
          throw new Error('Insufficient wallet balance')
        }

        await createWalletTransaction({
          walletId: wallet.id,
          amount: paymentAmount,
          type: 'debit',
          reason: 'invoice_payment',
          ref: id,
          meta: { invoiceNo: inv.invoiceNo, reference, notes, recordedBy: req.user.sub },
          tx: tx as any,
        })
      }

      // Record payment
      await tx.insert(invoicePayments).values({
        invoiceId: id,
        sellerId: inv.sellerId,
        method,
        amount,
        reference,
        notes,
      })

      // Mark any pending credit/waiver adjustments as applied when payment is made
      await tx
        .update(invoiceAdjustments)
        .set({ isApplied: true, updatedAt: new Date() })
        .where(
          and(
            eq(invoiceAdjustments.invoiceId, id),
            eq(invoiceAdjustments.sellerId, inv.sellerId),
            sql`${invoiceAdjustments.type} IN ('credit', 'waiver')`,
            sql`${invoiceAdjustments.isApplied} = false`,
          ),
        )
    })

    // Regenerate invoice with adjustments if payment was recorded
    try {
      await regenerateInvoiceWithAdjustments(id)
    } catch (regenerateErr: any) {
      console.error('Failed to regenerate invoice:', regenerateErr)
      // Don't fail the request if regeneration fails
    }

    // Recalculate statement AFTER regeneration to ensure outstanding is accurate
    const stmt = await getInvoiceStatement(id)
    if (stmt.outstanding <= 0 && inv.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      stmt.status = 'paid'
    } else if (stmt.outstanding > 0 && inv.status === 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      stmt.status = 'pending'
    }

    // Get final statement after status update
    const finalStmt = await getInvoiceStatement(id)

    return res.json({ statement: finalStmt })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

// User: Accept credits/waivers (auto-credit wallet)
export async function acceptInvoiceCredits(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { id } = req.params

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv || inv.sellerId !== userId) return res.status(404).json({ error: 'Invoice not found' })

    // Get all credit/waiver adjustments (only non-applied ones)
    const stmt = await getInvoiceStatement(id)
    const creditsWaivers = stmt.additions.credits + stmt.additions.waivers

    if (creditsWaivers <= 0) {
      return res.status(400).json({ error: 'No credits or waivers to accept' })
    }

    await db.transaction(async (tx) => {
      // Get user wallet
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
      if (!wallet) throw new Error('Wallet not found')

      // Mark credit/waiver adjustments as applied (prevents double-counting)
      await tx
        .update(invoiceAdjustments)
        .set({ isApplied: true, updatedAt: new Date() })
        .where(
          and(
            eq(invoiceAdjustments.invoiceId, id),
            eq(invoiceAdjustments.sellerId, userId),
            sql`${invoiceAdjustments.type} IN ('credit', 'waiver')`,
            sql`${invoiceAdjustments.isApplied} = false`,
          ),
        )

      // Credit wallet for credits/waivers
      await createWalletTransaction({
        walletId: wallet.id,
        amount: creditsWaivers,
        type: 'credit',
        reason: 'invoice_credits_waivers',
        ref: id,
        meta: {
          invoiceNo: inv.invoiceNo,
          credits: stmt.additions.credits,
          waivers: stmt.additions.waivers,
        },
        tx: tx as any,
      })
    })

    // Recalculate and update status
    const finalStmt = await getInvoiceStatement(id)
    // Check if there are unapplied credits/waivers (should be 0 after accepting, but check anyway)
    const hasUnappliedCreditsWaivers =
      finalStmt.additions.credits > 0 || finalStmt.additions.waivers > 0

    // If outstanding <= 0 AND no unapplied credits/waivers, mark as paid
    // If outstanding <= 0 BUT has unapplied credits/waivers, keep as pending
    if (finalStmt.outstanding <= 0 && !hasUnappliedCreditsWaivers && inv.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      finalStmt.status = 'paid'
    } else if ((finalStmt.outstanding > 0 || hasUnappliedCreditsWaivers) && inv.status === 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(billingInvoices.id, id))
      finalStmt.status = 'pending'
    }

    // Regenerate invoice with adjustments
    try {
      await regenerateInvoiceWithAdjustments(id)
    } catch (regenerateErr: any) {
      console.error('Failed to regenerate invoice:', regenerateErr)
      // Don't fail the request if regeneration fails
    }

    return res.json({
      statement: finalStmt,
      message: 'Credits/waivers accepted and wallet credited',
    })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function adminAddInvoiceAdjustment(req: any, res: Response) {
  try {
    const { id } = req.params
    const { type, amount, notes } = req.body as {
      type: 'credit' | 'debit' | 'waiver' | 'surcharge'
      amount: number
      notes?: string
    }

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    const numericAmount = Number(amount)
    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ error: 'Amount must be > 0' })

    await db.insert(invoiceAdjustments).values({
      invoiceId: id,
      sellerId: inv.sellerId,
      type: type as any,
      amount: numericAmount.toFixed(2),
      reason: notes,
      createdBy: req.user.sub,
    } as any)

    // Admin flow: any manual adjustment should require explicit finalization.
    await db
      .update(billingInvoices)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(billingInvoices.id, id))

    const finalStmt = await getInvoiceStatement(id)
    finalStmt.status = 'pending'
    return res.json({ statement: finalStmt })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

// Admin: list orders within an invoice period for CSV-like adjustment view
export async function adminGetInvoiceOrders(req: any, res: Response) {
  try {
    const { id } = req.params
    console.log('[adminGetInvoiceOrders] start', { invoiceId: id })
    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    // Use stored order numbers if available, otherwise fallback to date range
    // Handle cases where jsonb might come back as string/null
    let storedOrderNumbers: string[] = []
    const rawOrderNumbers: any = (inv as any).orderNumbers
    if (Array.isArray(rawOrderNumbers)) {
      storedOrderNumbers = rawOrderNumbers.filter((v) => typeof v === 'string' && v.length > 0)
    } else if (typeof rawOrderNumbers === 'string') {
      try {
        const parsed = JSON.parse(rawOrderNumbers)
        if (Array.isArray(parsed)) {
          storedOrderNumbers = parsed.filter((v) => typeof v === 'string' && v.length > 0)
        }
      } catch (_e) {
        // ignore parse error; fallback below
        storedOrderNumbers = []
      }
    }
    // de-duplicate
    if (storedOrderNumbers.length > 1) {
      storedOrderNumbers = Array.from(new Set(storedOrderNumbers))
    }
    let b2c: any[] = []
    let b2b: any[] = []
    let usingFallback = false

    if (storedOrderNumbers.length > 0) {
      // Fetch orders by stored order numbers (preferred method)
      try {
        console.log('[adminGetInvoiceOrders] querying by stored order numbers', {
          invoiceId: id,
          sellerId: inv.sellerId,
          count: storedOrderNumbers.length,
        })
        const [b2cRows, b2bRows] = await Promise.all([
          db
            .select()
            .from(b2c_orders)
            .where(
              and(
                eq(b2c_orders.user_id, inv.sellerId),
                inArray(b2c_orders.order_number, storedOrderNumbers),
              ),
            ),
          db
            .select()
            .from(b2b_orders)
            .where(
              and(
                eq(b2b_orders.user_id, inv.sellerId),
                inArray(b2b_orders.order_number, storedOrderNumbers),
              ),
            ),
        ])
        b2c = (Array.isArray(b2cRows) ? b2cRows : []).map((r: any) => ({
          id: r.id,
          order_number: r.order_number,
          integration_type: r.integration_type,
          awb_number: r.awb_number,
          freight_charges: r.freight_charges ?? null,
          cod_charges: r.cod_charges ?? null,
          transaction_fee: r.transaction_fee ?? null,
          gift_wrap: r.gift_wrap ?? null,
          discount: r.discount ?? null,
          created_at: r.created_at,
        }))
        b2b = (Array.isArray(b2bRows) ? b2bRows : []).map((r: any) => ({
          id: r.id,
          order_number: r.order_number,
          integration_type: r.order_type,
          awb_number: r.awb_number,
          freight_charges: r.freight_charges ?? r.shipping_charges ?? null,
          cod_charges: r.cod_charges ?? null,
          transaction_fee: r.transaction_fee ?? null,
          gift_wrap: r.gift_wrap ?? null,
          discount: r.discount ?? null,
          created_at: r.created_at,
        }))
        console.log('[adminGetInvoiceOrders] query by order numbers result sizes', {
          invoiceId: id,
          b2c: b2c.length,
          b2b: b2b.length,
        })
      } catch (err: any) {
        console.warn(
          `Failed to fetch orders by stored order numbers for invoice ${id}, falling back to date range:`,
          err.message,
        )
        usingFallback = true
      }
    } else {
      usingFallback = true
    }

    // Fallback to date range if order numbers not stored or query failed
    if (usingFallback || (storedOrderNumbers.length > 0 && b2c.length === 0 && b2b.length === 0)) {
      if (!inv.billingStart || !inv.billingEnd) {
        console.warn(
          `Invoice ${id} has no order numbers and no billing period, returning empty orders`,
        )
        return res.json({ orders: [] })
      }

      const start = new Date(inv.billingStart as any)
      const end = new Date(inv.billingEnd as any)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn(`Invoice ${id} has invalid billing period dates, returning empty orders`)
        return res.json({ orders: [] })
      }
      end.setHours(23, 59, 59, 999)
      console.log('[adminGetInvoiceOrders] querying by date range', {
        invoiceId: id,
        sellerId: inv.sellerId,
        start: start.toISOString(),
        end: end.toISOString(),
      })

      try {
        const [b2cRows, b2bRows] = await Promise.all([
          db
            .select()
            .from(b2c_orders)
            .where(
              and(
                eq(b2c_orders.user_id, inv.sellerId),
                between(b2c_orders.created_at, start as any, end as any),
              ),
            ),
          db
            .select()
            .from(b2b_orders)
            .where(
              and(
                eq(b2b_orders.user_id, inv.sellerId),
                between(b2b_orders.created_at, start as any, end as any),
              ),
            ),
        ])
        b2c = (Array.isArray(b2cRows) ? b2cRows : []).map((r: any) => ({
          id: r.id,
          order_number: r.order_number,
          integration_type: r.integration_type,
          awb_number: r.awb_number,
          freight_charges: r.freight_charges ?? null,
          cod_charges: r.cod_charges ?? null,
          transaction_fee: r.transaction_fee ?? null,
          gift_wrap: r.gift_wrap ?? null,
          discount: r.discount ?? null,
          created_at: r.created_at,
        }))
        b2b = (Array.isArray(b2bRows) ? b2bRows : []).map((r: any) => ({
          id: r.id,
          order_number: r.order_number,
          integration_type: r.order_type,
          awb_number: r.awb_number,
          freight_charges: r.freight_charges ?? r.shipping_charges ?? null,
          cod_charges: r.cod_charges ?? null,
          transaction_fee: r.transaction_fee ?? null,
          gift_wrap: r.gift_wrap ?? null,
          discount: r.discount ?? null,
          created_at: r.created_at,
        }))
        console.log('[adminGetInvoiceOrders] query by date range result sizes', {
          invoiceId: id,
          b2c: b2c.length,
          b2b: b2b.length,
        })
      } catch (err: any) {
        console.error(`Failed to fetch orders by date range for invoice ${id}:`, err)
        return res.status(400).json({ error: err.message || 'Failed to fetch invoice orders' })
      }
    }

    const allOrders = [...b2c, ...b2b]
    console.log('[adminGetInvoiceOrders] returning orders', {
      invoiceId: id,
      total: allOrders.length,
    })
    return res.json({ orders: allOrders })
  } catch (err: any) {
    console.error('Error in adminGetInvoiceOrders:', err)
    return res.status(400).json({ error: err.message || 'Failed to fetch invoice orders' })
  }
}

// Admin: bulk adjustments by order rows
export async function adminBulkInvoiceAdjustments(req: any, res: Response) {
  try {
    const { id } = req.params
    const { rows } = req.body as {
      rows: Array<{ orderId: string; amount: number; notes?: string }>
    }
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'No rows provided' })

    const [inv] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1)
    if (!inv) return res.status(404).json({ error: 'Invoice not found' })

    // Insert adjustments
    for (const r of rows) {
      const amt = Number(r.amount)
      if (!amt) continue
      const notes = r.notes?.trim() || ''
      const reason = notes ? `Order ${r.orderId}: ${notes}` : `Order ${r.orderId}`
      await db.insert(invoiceAdjustments).values({
        invoiceId: id,
        sellerId: inv.sellerId,
        type: amt >= 0 ? ('debit' as any) : ('credit' as any),
        amount: Math.abs(amt).toFixed(2),
        reason,
        createdBy: req.user.sub,
      } as any)
    }

    // Recalculate statement
    const statement = await getInvoiceStatement(id)

    // Admin flow: order-wise adjustments should never auto-finalize.
    // Force pending so admin must explicitly click Finalize Paid after review.
    await db
      .update(billingInvoices)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(billingInvoices.id, id))
    statement.status = 'pending'

    return res.json({ success: true, statement })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

export async function adminGetInvoiceStatement(req: any, res: Response) {
  try {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({ error: 'Invoice ID is required' })
    }
    // Admin can view any invoice statement without ownership check
    // Pass undefined for requestingUserId to skip ownership check
    const data = await getInvoiceStatement(id, undefined)
    // Keep admin-visible status exactly as persisted in DB.
    return res.json(data)
  } catch (err: any) {
    console.error('Error in adminGetInvoiceStatement:', err)
    return res.status(400).json({ error: err.message || 'Failed to get invoice statement' })
  }
}

// Merchant: Generate invoice manually with date range
export async function generateManualInvoice(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const { startDate, endDate } = req.body as {
      startDate: string
      endDate: string
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' })
    }

    const start = parseLocalDateBoundary(startDate, 'start')
    const end = parseLocalDateBoundary(endDate, 'end')

    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' })
    }

    if (start > end) {
      return res.status(400).json({ error: 'Start date must be before end date' })
    }

    const startDateYmd = formatDateYmdLocal(start)
    const endDateYmd = formatDateYmdLocal(end)
    const [existingInvoice] = await db
      .select({
        id: billingInvoices.id,
        invoiceNo: billingInvoices.invoiceNo,
        status: billingInvoices.status,
      })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.sellerId, userId),
          sql`${billingInvoices.billingStart} = ${startDateYmd}::date`,
          sql`${billingInvoices.billingEnd} = ${endDateYmd}::date`,
        ),
      )
      .limit(1)

    if (existingInvoice) {
      return res.status(409).json({
        error: `Invoice already exists for this period (${startDateYmd} to ${endDateYmd}): ${existingInvoice.invoiceNo}`,
      })
    }

    const candidateOrderNumbers = await getBillableOrderNumbersForRange(userId, start, end)
    const duplicateByOrders = await findDuplicateInvoiceByOrderNumbers(userId, candidateOrderNumbers)
    if (duplicateByOrders) {
      return res.status(409).json({
        error: `Invoice already exists for same order numbers in invoice ${duplicateByOrders.invoiceNo} (period: ${duplicateByOrders.billingStart} to ${duplicateByOrders.billingEnd}). Overlap: ${duplicateByOrders.overlapCount} order(s), e.g. ${duplicateByOrders.sampleOrderNumber}`,
      })
    }

    const result = await generateInvoiceForUser(userId, { startDate: start, endDate: end })

    if (!result) {
      return res.status(400).json({ error: 'No orders found for the selected period' })
    }

    return res.json({
      message: 'Invoice generated successfully',
      invoice: result,
    })
  } catch (err: any) {
    console.error('Error generating manual invoice:', err)
    return res.status(400).json({ error: err.message || 'Failed to generate invoice' })
  }
}

// Admin: Generate invoice manually for any user with date range
export async function adminGenerateManualInvoice(req: any, res: Response) {
  try {
    const userId =
      String(
        req.params?.userId ||
          req.body?.userId ||
          req.body?.sellerId ||
          req.query?.userId ||
          req.query?.sellerId ||
          '',
      ).trim() || null
    const startDate = String(
      req.body?.startDate || req.body?.billingStart || req.query?.startDate || req.query?.billingStart || '',
    ).trim()
    const endDate = String(
      req.body?.endDate || req.body?.billingEnd || req.query?.endDate || req.query?.billingEnd || '',
    ).trim()

    if (!userId) {
      return res.status(400).json({ error: 'Seller ID is required' })
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' })
    }

    const start = parseLocalDateBoundary(startDate, 'start')
    const end = parseLocalDateBoundary(endDate, 'end')

    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' })
    }

    if (start > end) {
      return res.status(400).json({ error: 'Start date must be before end date' })
    }

    const startDateYmd = formatDateYmdLocal(start)
    const endDateYmd = formatDateYmdLocal(end)
    const [existingInvoice] = await db
      .select({
        id: billingInvoices.id,
        invoiceNo: billingInvoices.invoiceNo,
        status: billingInvoices.status,
      })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.sellerId, userId),
          sql`${billingInvoices.billingStart} = ${startDateYmd}::date`,
          sql`${billingInvoices.billingEnd} = ${endDateYmd}::date`,
        ),
      )
      .limit(1)

    if (existingInvoice) {
      return res.status(409).json({
        error: `Invoice already exists for this seller and period (${startDateYmd} to ${endDateYmd}): ${existingInvoice.invoiceNo}`,
      })
    }

    const candidateOrderNumbers = await getBillableOrderNumbersForRange(userId, start, end)
    const duplicateByOrders = await findDuplicateInvoiceByOrderNumbers(userId, candidateOrderNumbers)
    if (duplicateByOrders) {
      return res.status(409).json({
        error: `Invoice already exists for same order numbers in invoice ${duplicateByOrders.invoiceNo} (period: ${duplicateByOrders.billingStart} to ${duplicateByOrders.billingEnd}). Overlap: ${duplicateByOrders.overlapCount} order(s), e.g. ${duplicateByOrders.sampleOrderNumber}`,
      })
    }

    console.log('[adminGenerateManualInvoice] generating invoice', {
      sellerId: userId,
      startDate: startDateYmd,
      endDate: endDateYmd,
    })

    const result = await generateInvoiceForUser(userId, { startDate: start, endDate: end })

    if (!result) {
      return res.status(400).json({ error: 'No orders found for the selected period' })
    }

    return res.json({
      message: 'Invoice generated successfully',
      invoice: result,
    })
  } catch (err: any) {
    console.error('Error generating manual invoice:', err)
    return res.status(400).json({ error: err.message || 'Failed to generate invoice' })
  }
}
