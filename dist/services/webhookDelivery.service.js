"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWebhookEvent = sendWebhookEvent;
exports.retryFailedWebhooks = retryFailedWebhooks;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const webhookSubscriptions_1 = require("../models/schema/webhookSubscriptions");
/**
 * Generate HMAC signature for webhook payload
 */
function generateWebhookSignature(payload, secret) {
    return crypto_1.default.createHmac('sha256', secret).update(payload).digest('hex');
}
/**
 * Deliver webhook to a single subscription
 */
async function deliverWebhook(subscription, payload) {
    const payloadString = JSON.stringify(payload);
    const signature = generateWebhookSignature(payloadString, subscription.secret);
    try {
        const response = await axios_1.default.post(subscription.url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': payload.event,
                'User-Agent': 'DelExpress-Webhooks/1.0',
            },
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        });
        const success = response.status >= 200 && response.status < 300;
        return {
            success,
            statusCode: response.status,
            error: success ? undefined : `HTTP ${response.status}`,
        };
    }
    catch (error) {
        if (error.response) {
            // Server responded with error status
            return {
                success: false,
                statusCode: error.response.status,
                error: `HTTP ${error.response.status}: ${error.response.statusText}`,
            };
        }
        else if (error.request) {
            // Request made but no response
            return {
                success: false,
                error: 'No response from webhook endpoint',
            };
        }
        else {
            // Error setting up request
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }
}
/**
 * Send webhook event to all active subscriptions that match the event type
 */
async function sendWebhookEvent(userId, eventType, eventData) {
    const MAX_PROCESSING_ATTEMPTS = 3;
    try {
        // Find all active subscriptions for this user that listen to this event
        const subscriptions = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.user_id, userId), (0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.is_active, true)));
        const matchingSubscriptions = subscriptions.filter((sub) => sub.events.includes(eventType));
        if (matchingSubscriptions.length === 0) {
            console.log(`No webhook subscriptions found for event ${eventType} and user ${userId}`);
            return;
        }
        const payload = {
            event: eventType,
            timestamp: new Date().toISOString(),
            data: eventData,
        };
        // Deliver to each subscription
        for (const subscription of matchingSubscriptions) {
            // Cap attempts to 3 to avoid endless processing
            const maxAttempts = Math.min(subscription.max_retries ?? MAX_PROCESSING_ATTEMPTS, MAX_PROCESSING_ATTEMPTS);
            const deliveryId = crypto_1.default.randomUUID();
            const eventId = eventData.order_id || eventData.awb_number || eventData.id || 'unknown';
            // Create delivery record
            const [delivery] = await client_1.db
                .insert(webhookSubscriptions_1.webhook_deliveries)
                .values({
                id: deliveryId,
                subscription_id: subscription.id,
                event_type: eventType,
                event_id: eventId,
                payload: payload,
                status: 'pending',
                attempt_count: 0,
                max_attempts: maxAttempts,
            })
                .returning();
            // Attempt delivery
            const result = await deliverWebhook(subscription, payload);
            // Update delivery record
            const updateData = {
                attempt_count: 1,
                http_status: result.statusCode,
                response_body: result.error || 'Success',
            };
            if (result.success) {
                updateData.status = 'delivered';
                updateData.delivered_at = new Date();
                // Update subscription stats
                await client_1.db
                    .update(webhookSubscriptions_1.webhook_subscriptions)
                    .set({
                    total_attempts: subscription.total_attempts + 1,
                    successful_deliveries: subscription.successful_deliveries + 1,
                    last_delivery_at: new Date(),
                    last_success_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, subscription.id));
            }
            else {
                updateData.status = 'failed';
                updateData.failed_at = new Date();
                updateData.error_message = result.error;
                // Schedule retry if attempts remaining
                if (delivery.attempt_count < maxAttempts) {
                    const retryDelay = subscription.retry_delay_ms * Math.pow(2, delivery.attempt_count); // Exponential backoff
                    updateData.next_retry_at = new Date(Date.now() + retryDelay);
                }
                // Update subscription stats
                await client_1.db
                    .update(webhookSubscriptions_1.webhook_subscriptions)
                    .set({
                    total_attempts: subscription.total_attempts + 1,
                    failed_deliveries: subscription.failed_deliveries + 1,
                    last_delivery_at: new Date(),
                    last_failure_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, subscription.id));
            }
            await client_1.db
                .update(webhookSubscriptions_1.webhook_deliveries)
                .set(updateData)
                .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_deliveries.id, deliveryId));
        }
    }
    catch (error) {
        console.error('Error sending webhook event:', error);
        // Don't throw - webhook failures shouldn't break the main flow
    }
}
/**
 * Retry failed webhook deliveries
 * This should be called by a cron job
 */
async function retryFailedWebhooks() {
    const now = new Date();
    const MAX_PROCESSING_ATTEMPTS = 3;
    // Find deliveries that need retrying
    const failedDeliveries = await client_1.db
        .select({
        delivery: webhookSubscriptions_1.webhook_deliveries,
        subscription: webhookSubscriptions_1.webhook_subscriptions,
    })
        .from(webhookSubscriptions_1.webhook_deliveries)
        .innerJoin(webhookSubscriptions_1.webhook_subscriptions, (0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_deliveries.subscription_id, webhookSubscriptions_1.webhook_subscriptions.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_deliveries.status, 'failed'), (0, drizzle_orm_1.lte)(webhookSubscriptions_1.webhook_deliveries.next_retry_at, now)));
    for (const { delivery, subscription } of failedDeliveries) {
        // Cap attempts to 3 to avoid endless processing loops
        const maxAttempts = Math.min(subscription.max_retries ?? MAX_PROCESSING_ATTEMPTS, MAX_PROCESSING_ATTEMPTS);
        if (delivery.attempt_count >= maxAttempts) {
            // Max retries reached, mark as permanently failed and stop scheduling
            await client_1.db
                .update(webhookSubscriptions_1.webhook_deliveries)
                .set({
                next_retry_at: null,
                response_body: delivery.response_body || 'Max retry attempts reached',
                error_message: delivery.error_message || 'Max retry attempts reached',
                failed_at: delivery.failed_at ?? new Date(),
            })
                .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_deliveries.id, delivery.id));
            continue;
        }
        const payload = delivery.payload;
        const result = await deliverWebhook(subscription, payload);
        const updateData = {
            attempt_count: delivery.attempt_count + 1,
            http_status: result.statusCode,
            response_body: result.error || 'Success',
        };
        if (result.success) {
            updateData.status = 'delivered';
            updateData.delivered_at = new Date();
            updateData.next_retry_at = null;
            // Update subscription stats
            await client_1.db
                .update(webhookSubscriptions_1.webhook_subscriptions)
                .set({
                total_attempts: subscription.total_attempts + 1,
                successful_deliveries: subscription.successful_deliveries + 1,
                last_delivery_at: new Date(),
                last_success_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, subscription.id));
        }
        else {
            updateData.error_message = result.error;
            // Schedule next retry if attempts remaining
            if (delivery.attempt_count + 1 < maxAttempts) {
                const retryDelay = subscription.retry_delay_ms * Math.pow(2, delivery.attempt_count);
                updateData.next_retry_at = new Date(Date.now() + retryDelay);
            }
            else {
                updateData.next_retry_at = null;
                updateData.response_body = result.error || 'Max retry attempts reached';
                updateData.error_message = result.error || 'Max retry attempts reached';
                updateData.failed_at = updateData.failed_at ?? new Date();
            }
            // Update subscription stats
            await client_1.db
                .update(webhookSubscriptions_1.webhook_subscriptions)
                .set({
                total_attempts: subscription.total_attempts + 1,
                failed_deliveries: subscription.failed_deliveries + 1,
                last_delivery_at: new Date(),
                last_failure_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, subscription.id));
        }
        await client_1.db
            .update(webhookSubscriptions_1.webhook_deliveries)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_deliveries.id, delivery.id));
    }
}
