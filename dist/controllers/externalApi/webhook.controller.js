"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.regenerateWebhookSecretController = exports.deleteWebhookController = exports.updateWebhookController = exports.getWebhookController = exports.listWebhooksController = exports.createWebhookController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const webhookSubscriptions_1 = require("../../models/schema/webhookSubscriptions");
const apiKeyGenerator_1 = require("../../utils/apiKeyGenerator");
/**
 * Create a webhook subscription
 * POST /api/v1/webhooks
 */
const createWebhookController = async (req, res) => {
    try {
        const userId = req.userId;
        const { url, name, events } = req.body;
        // Validate required fields
        if (!url || !events || !Array.isArray(events) || events.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'url and events (array) are required',
            });
        }
        // Validate URL format
        try {
            new URL(url);
        }
        catch {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL',
                message: 'Please provide a valid webhook URL',
            });
        }
        // Validate event types
        const validEvents = [
            'order.created',
            'order.updated',
            'order.shipped',
            'order.delivered',
            'order.failed',
            'order.rto',
            'order.cancelled',
            'order.return_created',
            'order.ndr',
            'shipment.label_generated',
            'shipment.manifest_generated',
            'tracking.updated',
        ];
        const invalidEvents = events.filter((e) => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid event types',
                message: `Invalid event types: ${invalidEvents.join(', ')}`,
                validEvents,
            });
        }
        // Generate secret for webhook signing
        const secret = (0, apiKeyGenerator_1.generateApiSecret)();
        // Create subscription
        const [subscription] = await client_1.db
            .insert(webhookSubscriptions_1.webhook_subscriptions)
            .values({
            user_id: userId,
            url,
            name: name || `Webhook ${new Date().toISOString()}`,
            events: events,
            secret,
            is_active: true,
        })
            .returning();
        res.status(201).json({
            success: true,
            message: 'Webhook subscription created',
            data: {
                id: subscription.id,
                url: subscription.url,
                name: subscription.name,
                events: subscription.events,
                secret: subscription.secret, // Return secret only on creation
                is_active: subscription.is_active,
                created_at: subscription.created_at,
            },
        });
    }
    catch (error) {
        console.error('Error creating webhook subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create webhook subscription',
            message: error.message || 'Internal server error',
        });
    }
};
exports.createWebhookController = createWebhookController;
/**
 * List webhook subscriptions
 * GET /api/v1/webhooks
 */
const listWebhooksController = async (req, res) => {
    try {
        const userId = req.userId;
        const subscriptions = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.user_id, userId));
        res.status(200).json({
            success: true,
            data: subscriptions.map((sub) => ({
                id: sub.id,
                url: sub.url,
                name: sub.name,
                events: sub.events,
                is_active: sub.is_active,
                total_attempts: sub.total_attempts,
                successful_deliveries: sub.successful_deliveries,
                failed_deliveries: sub.failed_deliveries,
                last_delivery_at: sub.last_delivery_at,
                created_at: sub.created_at,
                updated_at: sub.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Error listing webhook subscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list webhook subscriptions',
            message: error.message || 'Internal server error',
        });
    }
};
exports.listWebhooksController = listWebhooksController;
/**
 * Get webhook subscription by ID
 * GET /api/v1/webhooks/:id
 */
const getWebhookController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const [subscription] = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .limit(1);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'Webhook subscription not found',
            });
        }
        if (subscription.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this webhook subscription',
            });
        }
        res.status(200).json({
            success: true,
            data: {
                id: subscription.id,
                url: subscription.url,
                name: subscription.name,
                events: subscription.events,
                is_active: subscription.is_active,
                total_attempts: subscription.total_attempts,
                successful_deliveries: subscription.successful_deliveries,
                failed_deliveries: subscription.failed_deliveries,
                last_delivery_at: subscription.last_delivery_at,
                last_success_at: subscription.last_success_at,
                last_failure_at: subscription.last_failure_at,
                created_at: subscription.created_at,
                updated_at: subscription.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Error fetching webhook subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch webhook subscription',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getWebhookController = getWebhookController;
/**
 * Update webhook subscription
 * PUT /api/v1/webhooks/:id
 */
const updateWebhookController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { url, name, events, is_active } = req.body;
        // Check if subscription exists and belongs to user
        const [existing] = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .limit(1);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Webhook subscription not found',
            });
        }
        if (existing.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this webhook subscription',
            });
        }
        // Validate URL if provided
        if (url) {
            try {
                new URL(url);
            }
            catch {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid URL',
                    message: 'Please provide a valid webhook URL',
                });
            }
        }
        // Validate events if provided
        if (events) {
            const validEvents = [
                'order.created',
                'order.updated',
                'order.shipped',
                'order.delivered',
                'order.failed',
                'order.rto',
                'order.cancelled',
                'order.return_created',
                'order.ndr',
                'shipment.label_generated',
                'shipment.manifest_generated',
                'tracking.updated',
            ];
            const invalidEvents = events.filter((e) => !validEvents.includes(e));
            if (invalidEvents.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid event types',
                    message: `Invalid event types: ${invalidEvents.join(', ')}`,
                });
            }
        }
        // Update subscription
        const updateData = {};
        if (url)
            updateData.url = url;
        if (name)
            updateData.name = name;
        if (events)
            updateData.events = events;
        if (typeof is_active === 'boolean')
            updateData.is_active = is_active;
        const [updated] = await client_1.db
            .update(webhookSubscriptions_1.webhook_subscriptions)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .returning();
        res.status(200).json({
            success: true,
            message: 'Webhook subscription updated',
            data: {
                id: updated.id,
                url: updated.url,
                name: updated.name,
                events: updated.events,
                is_active: updated.is_active,
                updated_at: updated.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Error updating webhook subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update webhook subscription',
            message: error.message || 'Internal server error',
        });
    }
};
exports.updateWebhookController = updateWebhookController;
/**
 * Delete webhook subscription
 * DELETE /api/v1/webhooks/:id
 */
const deleteWebhookController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        // Check if subscription exists and belongs to user
        const [existing] = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .limit(1);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Webhook subscription not found',
            });
        }
        if (existing.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this webhook subscription',
            });
        }
        await client_1.db.delete(webhookSubscriptions_1.webhook_subscriptions).where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id));
        res.status(200).json({
            success: true,
            message: 'Webhook subscription deleted',
        });
    }
    catch (error) {
        console.error('Error deleting webhook subscription:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete webhook subscription',
            message: error.message || 'Internal server error',
        });
    }
};
exports.deleteWebhookController = deleteWebhookController;
/**
 * Regenerate webhook secret
 * POST /api/v1/webhooks/:id/regenerate-secret
 */
const regenerateWebhookSecretController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        // Check if subscription exists and belongs to user
        const [existing] = await client_1.db
            .select()
            .from(webhookSubscriptions_1.webhook_subscriptions)
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .limit(1);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'Webhook subscription not found',
            });
        }
        if (existing.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this webhook subscription',
            });
        }
        // Generate new secret
        const newSecret = (0, apiKeyGenerator_1.generateApiSecret)();
        // Update subscription with new secret
        const [updated] = await client_1.db
            .update(webhookSubscriptions_1.webhook_subscriptions)
            .set({ secret: newSecret })
            .where((0, drizzle_orm_1.eq)(webhookSubscriptions_1.webhook_subscriptions.id, id))
            .returning();
        res.status(200).json({
            success: true,
            message: 'Webhook secret regenerated',
            data: {
                id: updated.id,
                url: updated.url,
                name: updated.name,
                secret: updated.secret, // Return new secret
                updated_at: updated.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Error regenerating webhook secret:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to regenerate webhook secret',
            message: error.message || 'Internal server error',
        });
    }
};
exports.regenerateWebhookSecretController = regenerateWebhookSecretController;
