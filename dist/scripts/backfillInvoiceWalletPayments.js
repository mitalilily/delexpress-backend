"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillInvoiceWalletPayments = backfillInvoiceWalletPayments;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const billingInvoices_1 = require("../models/schema/billingInvoices");
const invoicePayments_1 = require("../models/schema/invoicePayments");
const wallet_1 = require("../models/schema/wallet");
/**
 * Script to backfill wallet payment entries from orders
 * Matches orders to invoices by billing period and aggregates wallet debits
 */
async function backfillInvoiceWalletPayments() {
    console.log('🔄 Starting backfill of wallet payments from orders...');
    try {
        // Get all invoices
        const allInvoices = await client_1.db.select().from(billingInvoices_1.billingInvoices);
        let processed = 0;
        let skipped = 0;
        let errors = 0;
        for (const invoice of allInvoices) {
            try {
                // Check if invoice already has payments
                const existingPayments = await client_1.db
                    .select()
                    .from(invoicePayments_1.invoicePayments)
                    .where((0, drizzle_orm_1.eq)(invoicePayments_1.invoicePayments.invoiceId, invoice.id));
                if (existingPayments.length > 0) {
                    console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: already has ${existingPayments.length} payment(s)`);
                    skipped++;
                    continue;
                }
                // Get all orders for this user within invoice billing period
                const startDate = new Date(invoice.billingStart);
                const endDate = new Date(invoice.billingEnd);
                endDate.setHours(23, 59, 59, 999); // Include full end date
                // Get B2C orders in period
                const b2cOrders = await client_1.db
                    .select()
                    .from(b2cOrders_1.b2c_orders)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, invoice.sellerId), (0, drizzle_orm_1.between)(b2cOrders_1.b2c_orders.created_at, startDate, endDate)));
                // Get B2B orders in period
                const b2bOrders = await client_1.db
                    .select()
                    .from(b2bOrders_1.b2b_orders)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, invoice.sellerId), (0, drizzle_orm_1.between)(b2bOrders_1.b2b_orders.created_at, startDate, endDate)));
                const allOrders = [...b2cOrders, ...b2bOrders];
                if (allOrders.length === 0) {
                    console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: no orders in billing period`);
                    skipped++;
                    continue;
                }
                // Get user's wallet
                const [wallet] = await client_1.db
                    .select()
                    .from(wallet_1.wallets)
                    .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, invoice.sellerId))
                    .limit(1);
                if (!wallet) {
                    console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: user has no wallet`);
                    skipped++;
                    continue;
                }
                // Calculate total order charges that should be paid
                let totalOrderCharges = 0;
                const orderDebits = [];
                for (const order of allOrders) {
                    const orderNumber = order.order_number || order.id;
                    const freightCharges = Number(order.freight_charges ?? order.shipping_charges) || 0; // Use actual courier freight
                    const transactionFee = 0; // Exclude customer-facing fees from billing backfill
                    const codCharges = Number(order.cod_charges) || 0;
                    const discount = 0; // Exclude customer-facing discount from billing backfill
                    const orderTotal = freightCharges + codCharges;
                    if (orderTotal > 0) {
                        totalOrderCharges += orderTotal;
                        // Check for wallet debit transactions for this order
                        const walletDebits = await client_1.db
                            .select()
                            .from(wallet_1.walletTransactions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id), (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, 'debit')));
                        // Try to match by ref containing order_number or checking meta
                        const matchingDebits = walletDebits.filter((wt) => {
                            const ref = wt.ref || '';
                            const meta = wt.meta || {};
                            return (ref.includes(orderNumber) ||
                                ref.includes(order.order_id || '') ||
                                meta.orderNumber === orderNumber ||
                                meta.orderId === order.order_id);
                        });
                        if (matchingDebits.length > 0) {
                            const debitAmount = matchingDebits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
                            orderDebits.push({
                                orderNumber,
                                orderTotal,
                                debitAmount,
                                matched: true,
                            });
                        }
                        else {
                            // Assume order was paid via wallet if orderTotal > 0
                            orderDebits.push({
                                orderNumber,
                                orderTotal,
                                debitAmount: orderTotal,
                                matched: false,
                            });
                        }
                    }
                }
                // Use total invoice amount or sum of order debits, whichever is available
                const paymentAmount = totalOrderCharges > 0 ? totalOrderCharges : Number(invoice.totalAmount) || 0;
                if (paymentAmount <= 0) {
                    console.log(`⏭️  Skipping invoice ${invoice.invoiceNo}: no order charges found`);
                    skipped++;
                    continue;
                }
                // Create wallet payment entry
                await client_1.db.insert(invoicePayments_1.invoicePayments).values({
                    invoiceId: invoice.id,
                    sellerId: invoice.sellerId,
                    method: 'wallet',
                    amount: paymentAmount.toString(),
                    reference: `backfill_from_orders_${allOrders.length}_orders`,
                    notes: `Backfilled from ${allOrders.length} orders (${orderDebits.filter((d) => d.matched).length} matched wallet debits)`,
                });
                // Update invoice status to paid
                await client_1.db
                    .update(billingInvoices_1.billingInvoices)
                    .set({ status: 'paid', updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(billingInvoices_1.billingInvoices.id, invoice.id));
                console.log(`✅ Added wallet payment from ${allOrders.length} orders: ${invoice.invoiceNo} (₹${paymentAmount.toFixed(2)})`);
                processed++;
            }
            catch (err) {
                console.error(`❌ Error processing invoice ${invoice.invoiceNo}:`, err.message);
                errors++;
            }
        }
        console.log('\n📊 Backfill Summary:');
        console.log(`   ✅ Processed: ${processed} invoices`);
        console.log(`   ⏭️  Skipped: ${skipped} invoices`);
        console.log(`   ❌ Errors: ${errors} invoices`);
        console.log('✅ Backfill completed!');
    }
    catch (err) {
        console.error('❌ Backfill failed:', err);
        throw err;
    }
}
// Run if called directly
if (require.main === module) {
    backfillInvoiceWalletPayments()
        .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
        .catch((err) => {
        console.error('❌ Script failed:', err);
        process.exit(1);
    });
}
