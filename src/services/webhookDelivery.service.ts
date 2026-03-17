import axios from 'axios'
import crypto from 'crypto'
import { and, eq, lte } from 'drizzle-orm'
import { db } from '../models/client'
import { webhook_deliveries, webhook_subscriptions } from '../models/schema/webhookSubscriptions'

export type WebhookEventType =
  | 'order.created'
  | 'order.updated'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.failed'
  | 'order.rto'
  | 'order.cancelled'
  | 'order.return_created'
  | 'order.ndr'
  | 'shipment.label_generated'
  | 'shipment.manifest_generated'
  | 'tracking.updated'

export interface WebhookPayload {
  event: WebhookEventType
  timestamp: string
  data: Record<string, any>
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Deliver webhook to a single subscription
 */
async function deliverWebhook(
  subscription: typeof webhook_subscriptions.$inferSelect,
  payload: WebhookPayload,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadString = JSON.stringify(payload)
  const signature = generateWebhookSignature(payloadString, subscription.secret)

  try {
    const response = await axios.post(subscription.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'User-Agent': 'DelExpress-Webhooks/1.0',
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    })

    const success = response.status >= 200 && response.status < 300

    return {
      success,
      statusCode: response.status,
      error: success ? undefined : `HTTP ${response.status}`,
    }
  } catch (error: any) {
    if (error.response) {
      // Server responded with error status
      return {
        success: false,
        statusCode: error.response.status,
        error: `HTTP ${error.response.status}: ${error.response.statusText}`,
      }
    } else if (error.request) {
      // Request made but no response
      return {
        success: false,
        error: 'No response from webhook endpoint',
      }
    } else {
      // Error setting up request
      return {
        success: false,
        error: error.message || 'Unknown error',
      }
    }
  }
}

/**
 * Send webhook event to all active subscriptions that match the event type
 */
export async function sendWebhookEvent(
  userId: string,
  eventType: WebhookEventType,
  eventData: Record<string, any>,
): Promise<void> {
  const MAX_PROCESSING_ATTEMPTS = 3
  try {
    // Find all active subscriptions for this user that listen to this event
    const subscriptions = await db
      .select()
      .from(webhook_subscriptions)
      .where(
        and(eq(webhook_subscriptions.user_id, userId), eq(webhook_subscriptions.is_active, true)),
      )

    const matchingSubscriptions = subscriptions.filter((sub) => sub.events.includes(eventType))

    if (matchingSubscriptions.length === 0) {
      console.log(`No webhook subscriptions found for event ${eventType} and user ${userId}`)
      return
    }

    const payload: WebhookPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: eventData,
    }

    // Deliver to each subscription
    for (const subscription of matchingSubscriptions) {
      // Cap attempts to 3 to avoid endless processing
      const maxAttempts = Math.min(
        subscription.max_retries ?? MAX_PROCESSING_ATTEMPTS,
        MAX_PROCESSING_ATTEMPTS,
      )
      const deliveryId = crypto.randomUUID()
      const eventId = eventData.order_id || eventData.awb_number || eventData.id || 'unknown'

      // Create delivery record
      const [delivery] = await db
        .insert(webhook_deliveries)
        .values({
          id: deliveryId,
          subscription_id: subscription.id,
          event_type: eventType,
          event_id: eventId,
          payload: payload as any,
          status: 'pending',
          attempt_count: 0,
          max_attempts: maxAttempts,
        })
        .returning()

      // Attempt delivery
      const result = await deliverWebhook(subscription, payload)

      // Update delivery record
      const updateData: any = {
        attempt_count: 1,
        http_status: result.statusCode,
        response_body: result.error || 'Success',
      }

      if (result.success) {
        updateData.status = 'delivered'
        updateData.delivered_at = new Date()

        // Update subscription stats
        await db
          .update(webhook_subscriptions)
          .set({
            total_attempts: subscription.total_attempts + 1,
            successful_deliveries: subscription.successful_deliveries + 1,
            last_delivery_at: new Date(),
            last_success_at: new Date(),
          })
          .where(eq(webhook_subscriptions.id, subscription.id))
      } else {
        updateData.status = 'failed'
        updateData.failed_at = new Date()
        updateData.error_message = result.error

        // Schedule retry if attempts remaining
        if (delivery.attempt_count < maxAttempts) {
          const retryDelay = subscription.retry_delay_ms * Math.pow(2, delivery.attempt_count) // Exponential backoff
          updateData.next_retry_at = new Date(Date.now() + retryDelay)
        }

        // Update subscription stats
        await db
          .update(webhook_subscriptions)
          .set({
            total_attempts: subscription.total_attempts + 1,
            failed_deliveries: subscription.failed_deliveries + 1,
            last_delivery_at: new Date(),
            last_failure_at: new Date(),
          })
          .where(eq(webhook_subscriptions.id, subscription.id))
      }

      await db
        .update(webhook_deliveries)
        .set(updateData)
        .where(eq(webhook_deliveries.id, deliveryId))
    }
  } catch (error: any) {
    console.error('Error sending webhook event:', error)
    // Don't throw - webhook failures shouldn't break the main flow
  }
}

/**
 * Retry failed webhook deliveries
 * This should be called by a cron job
 */
export async function retryFailedWebhooks(): Promise<void> {
  const now = new Date()
  const MAX_PROCESSING_ATTEMPTS = 3

  // Find deliveries that need retrying
  const failedDeliveries = await db
    .select({
      delivery: webhook_deliveries,
      subscription: webhook_subscriptions,
    })
    .from(webhook_deliveries)
    .innerJoin(
      webhook_subscriptions,
      eq(webhook_deliveries.subscription_id, webhook_subscriptions.id),
    )
    .where(and(eq(webhook_deliveries.status, 'failed'), lte(webhook_deliveries.next_retry_at, now)))

  for (const { delivery, subscription } of failedDeliveries) {
    // Cap attempts to 3 to avoid endless processing loops
    const maxAttempts = Math.min(
      subscription.max_retries ?? MAX_PROCESSING_ATTEMPTS,
      MAX_PROCESSING_ATTEMPTS,
    )

    if (delivery.attempt_count >= maxAttempts) {
      // Max retries reached, mark as permanently failed and stop scheduling
      await db
        .update(webhook_deliveries)
        .set({
          next_retry_at: null,
          response_body: delivery.response_body || 'Max retry attempts reached',
          error_message: delivery.error_message || 'Max retry attempts reached',
          failed_at: delivery.failed_at ?? new Date(),
        })
        .where(eq(webhook_deliveries.id, delivery.id))
      continue
    }

    const payload = delivery.payload as WebhookPayload
    const result = await deliverWebhook(subscription, payload)

    const updateData: any = {
      attempt_count: delivery.attempt_count + 1,
      http_status: result.statusCode,
      response_body: result.error || 'Success',
    }

    if (result.success) {
      updateData.status = 'delivered'
      updateData.delivered_at = new Date()
      updateData.next_retry_at = null

      // Update subscription stats
      await db
        .update(webhook_subscriptions)
        .set({
          total_attempts: subscription.total_attempts + 1,
          successful_deliveries: subscription.successful_deliveries + 1,
          last_delivery_at: new Date(),
          last_success_at: new Date(),
        })
        .where(eq(webhook_subscriptions.id, subscription.id))
    } else {
      updateData.error_message = result.error

      // Schedule next retry if attempts remaining
      if (delivery.attempt_count + 1 < maxAttempts) {
        const retryDelay = subscription.retry_delay_ms * Math.pow(2, delivery.attempt_count)
        updateData.next_retry_at = new Date(Date.now() + retryDelay)
      } else {
        updateData.next_retry_at = null
        updateData.response_body = result.error || 'Max retry attempts reached'
        updateData.error_message = result.error || 'Max retry attempts reached'
        updateData.failed_at = updateData.failed_at ?? new Date()
      }

      // Update subscription stats
      await db
        .update(webhook_subscriptions)
        .set({
          total_attempts: subscription.total_attempts + 1,
          failed_deliveries: subscription.failed_deliveries + 1,
          last_delivery_at: new Date(),
          last_failure_at: new Date(),
        })
        .where(eq(webhook_subscriptions.id, subscription.id))
    }

    await db
      .update(webhook_deliveries)
      .set(updateData)
      .where(eq(webhook_deliveries.id, delivery.id))
  }
}
