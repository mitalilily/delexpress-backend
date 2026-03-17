import { db } from '../client'
import { tracking_events } from '../schema/trackingEvents'

export async function logTrackingEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  courier?: string | null
  statusCode?: string | null
  statusText?: string | null
  location?: string | null
  raw?: any
}) {
  const { orderId, userId, awbNumber, courier, statusCode, statusText, location, raw } = params
  await db.insert(tracking_events).values({
    order_id: orderId,
    user_id: userId,
    awb_number: awbNumber || null,
    courier: courier || null,
    status_code: statusCode || null,
    status_text: statusText || null,
    location: location || null,
    raw: raw || null,
  })
}
