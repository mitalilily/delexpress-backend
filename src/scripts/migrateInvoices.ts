import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { b2b_orders, b2c_orders, invoicePreferences, invoices } from '../schema/schema'

async function migrateOrdersToInvoices() {
  try {
    // 1. Fetch all orders from both tables
    const [b2b, b2c] = await Promise.all([
      db.select().from(b2b_orders),
      db.select().from(b2c_orders),
    ])

    const allOrders = [
      ...b2b.map((o) => ({ ...o, _type: 'b2b' as const })),
      ...b2c.map((o) => ({ ...o, _type: 'b2c' as const })),
    ]
    console.log(`Found ${allOrders.length} total orders.`)

    // 2. Filter only orders with status = pickup_initiated
    const eligibleOrders = allOrders.filter((o) => o.order_status === 'pickup_initiated')
    console.log(`Found ${eligibleOrders.length} eligible orders.`)
    console.log('eligible', eligibleOrders)

    for (const order of eligibleOrders) {
      // 3. Check if invoice already exists for this orderId
      const existing = await db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceNumber, order.id.toString()))

      if (existing.length > 0) {
        console.log(`⚠️ Skipping order ${order.id}, invoice already exists.`)
        continue
      }

      // 4. Fetch invoice preferences for user
      const [prefs] = await db
        .select()
        .from(invoicePreferences)
        .where(eq(invoicePreferences.userId, order.user_id))

      const invoiceNumber = `${prefs?.prefix ?? ''}${
        (order as any)?.invoice_number ?? order.id.toString()
      }${prefs?.suffix ?? ''}`

      // 5. Insert new invoice
      await db.insert(invoices).values({
        userId: order.user_id,
        type: order._type, // ✅ track b2b / b2c
        invoiceNumber,
        billingPeriodFrom: order.created_at ?? new Date(),
        billingPeriodTo: order.created_at ?? new Date(),
        totalOrders: 1,
        invoiceDate: new Date(),
        link: order?.invoice_link || null,
        netPayableAmount: order.order_amount,
        status: 'pending',
        items: [
          {
            orderId: order.id.toString(),
            carrier: order.courier_partner ?? '',
            weightSlab: order.weight ?? 'N/A',
            shippingCharge: order.shipping_charges ?? 0,
            discount: order.discount ?? 0,
            finalCharge: order.order_amount,
            awb: order?.awb_number,
          },
        ],
      } as any)

      console.log(`✅ Migrated order ${order.id} (${order._type}) → invoice`)
    }

    console.log('🎉 Migration completed successfully!')
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  }
}

migrateOrdersToInvoices().then(() => process.exit(0))
