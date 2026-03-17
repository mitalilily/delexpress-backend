import { eq } from 'drizzle-orm'
import { db } from '../client'
import { billingInvoices } from '../schema/billingInvoices'
import { invoiceAdjustments } from '../schema/invoiceAdjustments'
import { invoiceCodOffsets } from '../schema/invoiceCodOffsets'
import { invoiceDisputes } from '../schema/invoiceDisputes'
import { invoicePayments } from '../schema/invoicePayments'
import { presignDownload } from './upload.service'

export type InvoiceStatement = {
  invoiceId: string
  invoiceNo: string
  sellerId: string
  period: { from: Date; to: Date }
  links: { pdf?: string; csv?: string }
  status: string
  totals: {
    netPayable: number
    taxBreakup: { cgst: number; sgst: number; igst: number }
    taxableValue: number
  }
  additions: {
    adjustments: number // positive adds to dues, negative reduces dues
    debits: number
    credits: number
    surcharges: number
    waivers: number
  }
  offsets: {
    codOffsets: number
  }
  payments: {
    received: number
    breakdown: { method: string; amount: number }[]
  }
  outstanding: number
  disputes: { id: string; status: string; subject: string }[]
  adjustmentHistory: Array<{
    id: string
    type: 'credit' | 'debit' | 'waiver' | 'surcharge'
    amount: number
    reason: string | null
    isApplied: boolean
    createdAt: Date
    createdBy: string | null
  }>
}

const toNumber = (v: any) => Number(v || 0)

export async function getInvoiceStatement(invoiceId: string, requestingUserId?: string) {
  const [inv] = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.id, invoiceId))
    .limit(1)

  if (!inv) throw new Error('Invoice not found')

  if (requestingUserId && inv.sellerId !== requestingUserId) {
    // Optional caller-side enforcement; route should also enforce auth
    throw new Error('Forbidden')
  }

  const [adjRows, payRows, codRows, disputeRows] = await Promise.all([
    db.select().from(invoiceAdjustments).where(eq(invoiceAdjustments.invoiceId, inv.id)),
    db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, inv.id)),
    db.select().from(invoiceCodOffsets).where(eq(invoiceCodOffsets.invoiceId, inv.id)),
    db
      .select({
        id: invoiceDisputes.id,
        status: invoiceDisputes.status,
        subject: invoiceDisputes.subject,
      })
      .from(invoiceDisputes)
      .where(eq(invoiceDisputes.invoiceId, inv.id)),
  ])

  // Filter out adjustments that are already applied (prevents double-counting)
  const activeAdjustments = adjRows.filter((a) => !(a as any).isApplied)

  // Base totals
  const taxableValue = toNumber(inv.taxableValue)
  const cgst = toNumber(inv.cgst)
  const sgst = toNumber(inv.sgst)
  const igst = toNumber(inv.igst)
  const netPayable = toNumber(inv.totalAmount)

  // Adjustments grouped (only count non-applied adjustments to prevent double-counting)
  let credits = 0,
    debits = 0,
    waivers = 0,
    surcharges = 0
  for (const a of activeAdjustments) {
    const amt = toNumber(a.amount)
    if (a.type === 'credit') credits += amt
    else if (a.type === 'debit') debits += amt
    else if (a.type === 'waiver') waivers += amt
    else if (a.type === 'surcharge') surcharges += amt
  }
  const adjustmentsTotal = -credits + debits - waivers + surcharges

  // Payments
  let paymentsReceived = 0
  const methodMap = new Map<string, number>()
  for (const p of payRows) {
    const amt = toNumber(p.amount)
    paymentsReceived += amt
    methodMap.set(p.method, (methodMap.get(p.method) || 0) + amt)
  }
  const paymentBreakdown = Array.from(methodMap.entries()).map(([method, amount]) => ({
    method,
    amount,
  }))

  // COD Offsets
  const codOffsets = codRows.reduce((acc, r) => acc + toNumber(r.amount), 0)

  // Calculate outstanding
  // Formula: baseAmount + adjustmentsTotal - paymentsReceived - codOffsets
  // Where adjustmentsTotal = -credits + debits - waivers + surcharges
  // This means credits and waivers reduce what's owed (negative impact)
  // Debits and surcharges increase what's owed (positive impact)
  const outstanding = Math.max(0, netPayable + adjustmentsTotal - paymentsReceived - codOffsets)

  // Ensure outstanding cannot be negative (credits/waivers can't overpay)
  // If outstanding becomes negative due to credits/waivers and payments, it should be 0
  const finalOutstanding = Math.max(0, outstanding)

  // Infer wallet payment for display if invoice is paid but no explicit payments/offsets exist
  if (inv.status === 'paid' && paymentsReceived === 0 && codOffsets === 0 && outstanding === 0) {
    const inferred = Math.max(0, netPayable + adjustmentsTotal)
    if (inferred > 0) {
      paymentsReceived = inferred
      const existingWallet = methodMap.get('wallet') || 0
      methodMap.set('wallet', existingWallet + inferred)
    }
  }

  // Adjustment history (sorted by date, newest first) - show all adjustments, including applied ones
  const adjustmentHistory = adjRows
    .map((a) => ({
      id: a.id,
      type: a.type as 'credit' | 'debit' | 'waiver' | 'surcharge',
      amount: toNumber(a.amount),
      reason: a.reason || null,
      isApplied: (a as any).isApplied || false,
      createdAt: (a.createdAt as unknown as Date) || new Date(),
      createdBy: a.createdBy || null,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // Presign PDF and CSV URLs
  let pdfUrl: string | undefined = undefined
  let csvUrl: string | undefined = undefined
  try {
    if (inv.pdfUrl) {
      const presignedPdf = await presignDownload(inv.pdfUrl)
      pdfUrl = Array.isArray(presignedPdf)
        ? presignedPdf.length > 0
          ? presignedPdf[0]
          : undefined
        : presignedPdf || undefined
    }
    if (inv.csvUrl) {
      const presignedCsv = await presignDownload(inv.csvUrl)
      csvUrl = Array.isArray(presignedCsv)
        ? presignedCsv.length > 0
          ? presignedCsv[0]
          : undefined
        : presignedCsv || undefined
    }
  } catch (err) {
    console.error(`Failed to presign URLs for invoice ${inv.invoiceNo}:`, err)
  }

  const statement: InvoiceStatement = {
    invoiceId: inv.id,
    invoiceNo: inv.invoiceNo,
    sellerId: inv.sellerId,
    period: { from: inv.billingStart as unknown as Date, to: inv.billingEnd as unknown as Date },
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
  }

  return statement
}
