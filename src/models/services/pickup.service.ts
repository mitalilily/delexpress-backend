import { eq } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { DelhiveryService } from './couriers/delhivery.service'
import { EkartService } from './couriers/ekart.service'
import { XpressbeesService } from './couriers/xpressbees.service'
import { applyCancellationRefundOnce } from './webhookProcessor'

export async function cancelOrderShipment(orderId: string) {
  console.log('🔍 Starting cancellation for orderId:', orderId)

  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId))

  if (!order) {
    console.error('❌ Order not found:', orderId)
    throw new Error('Order not found')
  }

  console.log('📦 Order found:', {
    orderId: order.id,
    orderNumber: order.order_number,
    integrationType: order.integration_type,
    awbNumber: order.awb_number,
    shipmentId: order.shipment_id,
    currentStatus: order.order_status,
  })

  const integration = (order.integration_type || '').toLowerCase()
  if (!['delhivery', 'ekart', 'xpressbees'].includes(integration)) {
    console.error('❌ Unsupported integration type:', { orderId, integration })
    throw new Error('Only Delhivery, Ekart and Xpressbees are supported for cancellation')
  }

  if (!order.awb_number) {
    console.error('❌ Courier cancellation failed: Missing AWB number', { orderId, integration })
    throw new Error('Cancellation requires an AWB number')
  }

  console.log('🚚 Attempting courier cancellation:', {
    orderId,
    awbNumber: order.awb_number,
    integration,
  })

  let cancellationResult: any = null
  if (integration === 'delhivery') {
    const svc = new DelhiveryService()
    cancellationResult = await svc.cancelShipment(order.awb_number)
  } else if (integration === 'ekart') {
    const svc = new EkartService()
    cancellationResult = await svc.cancelShipment(order.awb_number)
  } else {
    const svc = new XpressbeesService()
    cancellationResult = await svc.cancelShipment(order.awb_number)
  }

  // Validate courier response
  // Check for various success indicators: boolean status, string status, success flags, or cancellation remark
  const isSuccess =
    cancellationResult?.success === true ||
    cancellationResult?.Success === true ||
    cancellationResult?.status === true || // Boolean true (most common)
    cancellationResult?.status === 'Success' ||
    cancellationResult?.status === 'success' ||
    cancellationResult?.response?.status === true ||
    (cancellationResult?.remark &&
      cancellationResult.remark.toLowerCase().includes('cancelled')) || // Check remark field for cancellation confirmation
    (cancellationResult?.message &&
      cancellationResult?.message.toLowerCase().includes('success') &&
      !cancellationResult?.error) ||
    (cancellationResult?.message &&
      cancellationResult?.message.toLowerCase().includes('cancelled') &&
      !cancellationResult?.error)

  console.log('🔍 Courier response validation:', {
    integration,
    isSuccess,
    success: cancellationResult?.success,
    Success: cancellationResult?.Success,
    status: cancellationResult?.status,
    statusType: typeof cancellationResult?.status,
    remark: cancellationResult?.remark,
    message: cancellationResult?.message,
    error: cancellationResult?.error,
    fullResponse: cancellationResult,
  })

  if (!isSuccess) {
    const errorMsg =
      cancellationResult?.error || cancellationResult?.message || 'Courier cancellation not accepted'
    console.error('❌ Courier cancellation failed:', {
      orderId,
      integration,
      response: cancellationResult,
      message: errorMsg,
    })
    throw new Error(errorMsg)
  }

  console.log('✅ Courier cancellation successful')

  const finalStatus = 'cancelled'

  console.log(`💾 Updating order status to ${finalStatus}:`, { orderId, integration })

  await db.transaction(async (tx) => {
    await tx
      .update(b2c_orders)
      .set({ order_status: finalStatus, updated_at: new Date() })
      .where(eq(b2c_orders.id, orderId))

    await applyCancellationRefundOnce(tx, order, 'pickup_cancel_api')
  })

  console.log(`✅ Order status updated to ${finalStatus} successfully:`, { orderId, integration })

  return cancellationResult
}
