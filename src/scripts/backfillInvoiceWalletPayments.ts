import { and, between, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import { billingInvoices } from '../models/schema/billingInvoices'
import { invoicePayments } from '../models/schema/invoicePayments'
import { walletTransactions, wallets } from '../models/schema/wallet'

/**
 * Script to backfill wallet payment entries from orders
 * Matches orders to invoices by billing period and aggregates wallet debits
 */
export async function backfillInvoiceWalletPayments() {
  console.log('🔄 Starting backfill of wallet payments from orders...')

  try {
    // Get all invoices
    const allInvoices = await db.select().from(billingInvoices)

    let processed = 0
    let skipped = 0
    let errors = 0

    for (const invoice of allInvoices) {
      try {
        // Check if invoice already has payments
        const existingPayments = await db
          .select()
          .from(invoicePayments)
          .where(eq(invoicePayments.invoiceId, invoice.id))

        if (existingPayments.length > 0) {
          console.log(
            `⏭️  Skipping invoice ${invoice.invoiceNo}: already has ${existingPayments.length} payment(s)`,
          )
          skipped++
          continue
        }

        // Get all orders for this user within invoice billing period
        const startDate = new Date(invoice.billingStart as any)
        const endDate = new Date(invoice.billingEnd as any)
        endDate.setHours(23, 59, 59, 999) // Include full end date

        // Get B2C orders in period
        const b2cOrders = await db
          .select()
          .from(b2c_orders)
          .where(
            and(
              eq(b2c_orders.user_id, invoice.sellerId),
              between(b2c_orders.created_at, startDate, endDate),
            ),
          )

        // Get B2B orders in period
        const b2bOrders = await db
          .select()
          .from(b2b_orders)
          .where(
            and(
              eq(b2b_orders.user_id, invoice.sellerId),
              between(b2b_orders.created_at, startDate, endDate),
            ),
          )

        const allOrders = [...b2cOrders, ...b2bOrders]

        if (allOrders.length === 0) {
          console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: no orders in billing period`)
          skipped++
          continue
        }

        // Get user's wallet
        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.userId, invoice.sellerId))
          .limit(1)

        if (!wallet) {
          console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: user has no wallet`)
          skipped++
          continue
        }

        // Calculate total order charges that should be paid
        let totalOrderCharges = 0
        const orderDebits: any[] = []

        for (const order of allOrders) {
          const orderNumber = (order as any).order_number || order.id
          const freightCharges = Number((order as any).freight_charges ?? (order as any).shipping_charges) || 0 // Use actual courier freight
          const transactionFee = 0 // Exclude customer-facing fees from billing backfill
          const codCharges = Number((order as any).cod_charges) || 0
          const discount = 0 // Exclude customer-facing discount from billing backfill
          const orderTotal = freightCharges + codCharges

          if (orderTotal > 0) {
            totalOrderCharges += orderTotal

            // Check for wallet debit transactions for this order
            const walletDebits = await db
              .select()
              .from(walletTransactions)
              .where(
                and(
                  eq(walletTransactions.wallet_id, wallet.id),
                  eq(walletTransactions.type, 'debit'),
                  // Check if ref or meta contains order reference
                  // This is a best-effort match - adjust based on your actual ref format
                ),
              )

            // Try to match by ref containing order_number or checking meta
            const matchingDebits = walletDebits.filter((wt) => {
              const ref = wt.ref || ''
              const meta = (wt.meta as any) || {}
              return (
                ref.includes(orderNumber) ||
                ref.includes((order as any).order_id || '') ||
                meta.orderNumber === orderNumber ||
                meta.orderId === (order as any).order_id
              )
            })

            if (matchingDebits.length > 0) {
              const debitAmount = matchingDebits.reduce((sum, d) => sum + Number(d.amount || 0), 0)
              orderDebits.push({
                orderNumber,
                orderTotal,
                debitAmount,
                matched: true,
              })
            } else {
              // Assume order was paid via wallet if orderTotal > 0
              orderDebits.push({
                orderNumber,
                orderTotal,
                debitAmount: orderTotal,
                matched: false,
              })
            }
          }
        }

        // Use total invoice amount or sum of order debits, whichever is available
        const paymentAmount =
          totalOrderCharges > 0 ? totalOrderCharges : Number(invoice.totalAmount) || 0

        if (paymentAmount <= 0) {
          console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: no order charges found`)
          skipped++
          continue
        }

        // Create wallet payment entry
        await db.insert(invoicePayments).values({
          invoiceId: invoice.id,
          sellerId: invoice.sellerId,
          method: 'wallet' as any,
          amount: paymentAmount.toString(),
          reference: `backfill_from_orders_${allOrders.length}_orders`,
          notes: `Backfilled from ${allOrders.length} orders (${
            orderDebits.filter((d) => d.matched).length
          } matched wallet debits)`,
        } as any)

        // Update invoice status to paid
        await db
          .update(billingInvoices)
          .set({ status: 'paid', updatedAt: new Date() })
          .where(eq(billingInvoices.id, invoice.id))

        console.log(
          `✅ Added wallet payment from ${allOrders.length} orders: ${
            invoice.invoiceNo
          } (₹${paymentAmount.toFixed(2)})`,
        )

        processed++
      } catch (err: any) {
        console.error(`❌ Error processing invoice ${invoice.invoiceNo}:`, err.message)
        errors++
      }
    }

    console.log('\n📊 Backfill Summary:')
    console.log(`   ✅ Processed: ${processed} invoices`)
    console.log(`   ⏭️  Skipped: ${skipped} invoices`)
    console.log(`   ❌ Errors: ${errors} invoices`)
    console.log('✅ Backfill completed!')
  } catch (err: any) {
    console.error('❌ Backfill failed:', err)
    throw err
  }
}

// Run if called directly
if (require.main === module) {
  backfillInvoiceWalletPayments()
    .then(() => {
      console.log('✅ Script completed successfully')
      process.exit(0)
    })
    .catch((err) => {
      console.error('❌ Script failed:', err)
      process.exit(1)
    })
}
