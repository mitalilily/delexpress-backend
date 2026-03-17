import dayjs from 'dayjs'
import { desc, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { tracking_events } from '../models/schema/trackingEvents'
import { createNotificationService } from '../models/services/notifications.service'

// Basic thresholds
const IN_TRANSIT_SLA_HOURS = 72

export async function monitorSlaAndOda() {
  const now = dayjs()

  // Find orders still in transit for > SLA hours
  const cutoff = now.subtract(IN_TRANSIT_SLA_HOURS, 'hour').toDate()

  const inTransitOrders = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.order_status, 'in_transit'))

  for (const order of inTransitOrders) {
    const events = await db
      .select()
      .from(tracking_events)
      .where(eq(tracking_events.order_id, order.id))
      .orderBy(desc(tracking_events.created_at))

    const lastEvent = events?.[0]
    const lastTime = lastEvent?.created_at ? new Date(lastEvent.created_at) : order.updated_at

    if (lastTime && lastTime < cutoff) {
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: 'SLA breach risk',
        message: `Order ${order.order_number} is in transit beyond ${IN_TRANSIT_SLA_HOURS}h.`,
      })
      await createNotificationService({
        targetRole: 'admin',
        title: 'SLA breach risk',
        message: `User ${order.user_id} order ${order.order_number} is delayed.`,
      })
    }

    // ODA heuristic: status_text contains ODA or message has ODA
    const hadODA = events?.some(
      (e) =>
        (e.status_text || '').toLowerCase().includes('oda') ||
        (e.raw as any)?.message?.toLowerCase?.().includes('oda'),
    )
    if (hadODA) {
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: 'ODA Area Notice',
        message: `Order ${order.order_number} flagged as ODA by courier. Expect delays.`,
      })
      await createNotificationService({
        targetRole: 'admin',
        title: 'ODA flagged',
        message: `User ${order.user_id} order ${order.order_number} flagged ODA.`,
      })
    }
  }
}
