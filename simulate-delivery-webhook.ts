/**
 * Simulate Delivery Webhook for Testing
 * Run this to mark an order as delivered and create COD remittance
 * 
 * Usage: npx tsx simulate-delivery-webhook.ts
 */

import { processNimbusWebhookPayload } from './src/models/services/webhookProcessor'

async function simulateDeliveryWebhook() {
  const awbNumber = '43493010000044' // ← Change this to your AWB

  console.log(`\n🚀 Simulating delivery webhook for AWB: ${awbNumber}\n`)

  const payload = {
    awb_number: awbNumber,
    status: 'Delivered', // ← This triggers COD remittance creation
    location: 'Test Location',
    message: 'Order delivered successfully (simulated)',
    delivered_at: new Date().toISOString(),
  }

  try {
    console.log('📦 Webhook Payload:', JSON.stringify(payload, null, 2))
    console.log('\n⏳ Processing webhook...\n')

    const result = await processNimbusWebhookPayload(payload)

    if (result.success === false) {
      console.error('❌ Webhook processing failed:', result.reason)
      if (result.reason === 'order_not_found') {
        console.error(`\n❌ Order with AWB "${awbNumber}" not found in b2c_orders table!`)
        console.error('   Please verify the AWB number exists in your database.')
      }
    } else {
      console.log('✅ Webhook processed successfully!')
      console.log('\n📋 What happened:')
      console.log('  1. ✅ Order status updated to "delivered"')
      console.log('  2. ✅ COD remittance entry created')
      console.log('  3. ✅ Now you can upload CSV and it will match!\n')
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error)
  }
}

// Run the simulation
simulateDeliveryWebhook()
  .then(() => {
    console.log('\n✅ Simulation complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Simulation failed:', error)
    process.exit(1)
  })

