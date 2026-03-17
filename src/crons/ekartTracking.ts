import { and, eq, isNull, notInArray, or } from 'drizzle-orm'
import { EkartService } from '../models/services/couriers/ekart.service'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { logTrackingEvent } from '../models/services/trackingEvents.service'
import { sendWebhookEvent } from '../services/webhookDelivery.service'
import { wallets } from '../models/schema/wallet'
import { createWalletTransaction } from '../models/services/wallet.service'

const terminalStatuses = ['delivered', 'cancelled', 'rto_delivered']

const statusMap: Record<string, string> = {
  'order placed': 'booked',
  booked: 'booked',
  'pickup scheduled': 'pickup_initiated',
  'pickup booked': 'pickup_initiated',
  'in transit': 'in_transit',
  'out for delivery': 'out_for_delivery',
  delivered: 'delivered',
  'delivery attempted': 'ndr',
  ndr: 'ndr',
  'return to origin': 'rto_initiated',
  'rto initiated': 'rto_initiated',
  'rto in transit': 'rto_in_transit',
  'rto delivered': 'rto_delivered',
  manifested: 'pickup_initiated',
}

function mapEkartStatus(raw?: string): string {
  if (!raw) return 'unknown'
  const norm = raw.toLowerCase()
  if (statusMap[norm]) return statusMap[norm]
  if (norm.includes('out for delivery')) return 'out_for_delivery'
  if (norm.includes('attempt')) return 'ndr'
  if (norm.includes('rto') && norm.includes('transit')) return 'rto_in_transit'
  if (norm.includes('rto')) return 'rto_initiated'
  if (norm.includes('pickup')) return 'pickup_initiated'
  if (norm.includes('deliver')) return 'delivered'
  return 'in_transit'
}

export async function pollEkartTracking(batchSize = 50) {
  const pending = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        eq(b2c_orders.integration_type, 'ekart'),
        or(notInArray(b2c_orders.order_status, terminalStatuses), isNull(b2c_orders.order_status)),
      ),
    )
    .limit(batchSize)

  if (!pending.length) {
    return
  }

  const ekart = new EkartService()

  for (const order of pending) {
    const awb = order.awb_number
    if (!awb) continue

    try {
      const track = await ekart.track(awb)
      const statusText = track?.track?.status || ''
      const mapped = mapEkartStatus(statusText)

      if (!mapped || mapped === 'unknown') continue

      const prevStatus = order.order_status || ''

      await db
        .update(b2c_orders)
        .set({ order_status: mapped, updated_at: new Date() })
        .where(eq(b2c_orders.id, order.id))

      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number ?? undefined,
        courier: 'Ekart',
        statusCode: mapped,
        statusText,
        location: track?.track?.location ?? '',
        raw: track,
      })

      await sendWebhookEvent(order.user_id, 'tracking.updated', {
        order_id: order.id,
        awb_number: order.awb_number,
        status: mapped,
        raw_status: statusText,
        courier_partner: order.courier_partner ?? 'Ekart',
      })

      if (mapped === 'rto_initiated' && prevStatus !== 'rto_initiated') {
        const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, order.user_id))
        const amount = Number(order.freight_charges ?? order.shipping_charges ?? 0) || 0
        if (wallet && amount > 0) {
          const newBalance = Number(wallet.balance ?? 0) - amount
          await db
            .update(wallets)
            .set({ balance: newBalance.toString() })
            .where(eq(wallets.id, wallet.id))
          await createWalletTransaction({
            walletId: wallet.id,
            amount,
            type: 'debit',
            currency: wallet.currency ?? 'INR',
            reason: `RTO freight - Ekart (${order.order_number})`,
            meta: { awb: order.awb_number },
            tx: db as any,
          })
        }
      }
    } catch (err: any) {
      console.error(`❌ Ekart tracking failed for ${awb}:`, err?.message || err)
    }
  }
}
