/**
 * Directly Create COD Remittance Entry (Bypass Webhook)
 * Use this if webhook simulation doesn't work
 *
 * Usage: npx tsx create-cod-remittance-directly.ts
 */

import { eq } from 'drizzle-orm'
import { db } from './src/models/client'
import { b2c_orders } from './src/models/schema/b2cOrders'
import { createCodRemittance } from './src/models/services/codRemittance.service'

async function createCodRemittanceDirectly() {
  const awbNumber = '43493010000044' // ← Change this to your AWB

  console.log(`\n🔍 Looking for order with AWB: ${awbNumber}\n`)

  try {
    // 1. Find the order
    const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.awb_number, awbNumber))

    if (!order) {
      console.error(`❌ Order not found with AWB: ${awbNumber}`)
      console.error('   Please check the AWB number is correct.')
      process.exit(1)
    }

    console.log('✅ Order found:')
    console.log('   Order Number:', order.order_number)
    console.log('   Order Type:', order.order_type)
    console.log('   Status:', order.order_status)
    console.log('   Amount:', order.order_amount)
    console.log('')

    // 2. Verify it's a COD order
    if (order.order_type !== 'cod') {
      console.error(`❌ This is not a COD order (type: ${order.order_type})`)
      console.error('   COD remittance can only be created for COD orders.')
      process.exit(1)
    }

    // 3. Update order status to delivered (if not already)
    if (order.order_status !== 'delivered') {
      console.log(`📝 Updating order status from "${order.order_status}" to "delivered"...`)
      await db
        .update(b2c_orders)
        .set({
          order_status: 'delivered',
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, order.id))
      console.log('✅ Order status updated to "delivered"\n')
    }

    // 4. Create COD remittance entry
    console.log('💰 Creating COD remittance entry...\n')

    const { remittance } = await createCodRemittance({
      orderId: order.id,
      orderType: 'b2c',
      userId: order.user_id,
      orderNumber: order.order_number,
      awbNumber: order.awb_number || undefined,
      courierPartner: order.courier_partner || 'xpressbees',
      codAmount: Number(order.order_amount || 0),
      codCharges: Number(order.cod_charges || 0),
      freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
      collectedAt: new Date(),
    })

    // console.log('✅ COD Remittance Created Successfully!')
    // console.log('')
    // console.log('📋 Remittance Details:')
    // console.log('   ID:', remittance.data?.id)
    // console.log('   Order Number:', remittance.data?.orderNumber)
    // console.log('   AWB:', remittance.data?.awbNumber)
    // console.log('   Status:', remittance.data?.status)
    // console.log('   COD Amount: ₹', remittance.data?.codAmount)
    // console.log('   Remittable Amount: ₹', remittance.data?.remittableAmount)
    // console.log('')
    // console.log('🎉 Now you can upload your CSV and it will match this order!')
    // console.log('')
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  COD remittance already exists for this order!')
      console.log('   You can proceed with CSV upload.')
    } else {
      console.error('❌ Error:', error.message)
      console.error(error)
      process.exit(1)
    }
  }
}

// Run the script
createCodRemittanceDirectly()
  .then(() => {
    console.log('✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
