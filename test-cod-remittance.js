/**
 * Test Script to Create Real COD Remittance Data
 * 
 * This script creates sample COD remittances using real data
 * Run this after migration to populate your COD Remittance page with data
 */

import { db } from './src/models/client.js'
import { codRemittances } from './src/models/schema/codRemittance.js'
import { b2c_orders } from './src/models/schema/b2cOrders.js'
import { eq } from 'drizzle-orm'

async function createTestData() {
  try {
    console.log('🔍 Finding COD orders in your database...')

    // Get actual COD orders from your database
    const codOrders = await db
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.order_type, 'cod'))
      .limit(10)

    if (codOrders.length === 0) {
      console.log('⚠️  No COD orders found in database.')
      console.log('💡 Create a COD order first, then mark it as delivered.')
      return
    }

    console.log(`✅ Found ${codOrders.length} COD orders`)

    // Create remittances for delivered COD orders
    let created = 0
    for (const order of codOrders) {
      // Skip if remittance already exists
      const [existing] = await db
        .select()
        .from(codRemittances)
        .where(eq(codRemittances.orderId, order.id))

      if (existing) {
        console.log(`⏭️  Skipping ${order.order_number} - remittance already exists`)
        continue
      }

      // Calculate amounts
      const codAmount = Number(order.order_amount || 0)
      const codCharges = Number(order.cod_charges || 0)
      const shippingCharges = Number(order.shipping_charges || 0)
      const deductions = codCharges + shippingCharges
      const remittableAmount = codAmount - deductions

      // Create remittance
      const [remittance] = await db
        .insert(codRemittances)
        .values({
          userId: order.user_id,
          orderId: order.id,
          orderType: order.order_type || 'b2c',
          orderNumber: order.order_number,
          awbNumber: order.awb_number,
          courierPartner: order.courier_partner,
          codAmount: codAmount.toString(),
          codCharges: codCharges.toString(),
          shippingCharges: shippingCharges.toString(),
          deductions: deductions.toString(),
          remittableAmount: remittableAmount.toString(),
          status: order.order_status === 'delivered' ? 'pending' : 'pending',
          collectedAt: order.order_status === 'delivered' ? new Date() : null,
          remittedAt: null,
          utrNumber: null,
        })
        .returning()

      console.log(`✅ Created remittance for ${order.order_number}:`)
      console.log(`   COD Amount: ₹${codAmount}`)
      console.log(`   Deductions: ₹${deductions}`)
      console.log(`   Remittable: ₹${remittableAmount}`)
      console.log(`   Status: ${remittance.status}`)
      console.log('')
      created++
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🎉 Created ${created} COD remittances!`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('✅ Now visit: http://localhost:5173/cod-remittance')
    console.log('   You should see real data in the cards and table!')
    console.log('')

  } catch (error) {
    console.error('❌ Error creating test data:', error)
  } finally {
    process.exit(0)
  }
}

createTestData()

