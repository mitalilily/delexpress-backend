"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyOrderWebhookController = exports.syncShopifyOrdersController = void 0;
const shopify_service_1 = require("../models/services/shopify.service");
const syncShopifyOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? 50);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 250) : 50;
        const storeId = String(req.body?.storeId ?? req.query?.storeId ?? '').trim() || undefined;
        const result = await (0, shopify_service_1.syncShopifyOrdersForUser)(userId, limit, storeId);
        return res.status(200).json({
            success: true,
            message: 'Shopify orders synced successfully',
            ...result,
        });
    }
    catch (error) {
        console.error('Shopify sync failed:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to sync Shopify orders',
        });
    }
};
exports.syncShopifyOrdersController = syncShopifyOrdersController;
const shopifyOrderWebhookController = async (req, res) => {
    try {
        const rawBody = req.body;
        const hmac = String(req.headers['x-shopify-hmac-sha256'] || '');
        const topic = String(req.headers['x-shopify-topic'] || '');
        const shopDomain = String(req.headers['x-shopify-shop-domain'] || '');
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
        }
        const isValid = await (0, shopify_service_1.verifyShopifyWebhookSignatureForDomain)(rawBody, hmac, shopDomain);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid Shopify webhook signature' });
        }
        const payload = JSON.parse(rawBody.toString('utf8') || '{}');
        const result = await (0, shopify_service_1.processShopifyWebhookOrder)(shopDomain, topic, payload);
        return res.status(200).json({ success: true, result });
    }
    catch (error) {
        console.error('Shopify webhook handling failed:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to process Shopify webhook',
        });
    }
};
exports.shopifyOrderWebhookController = shopifyOrderWebhookController;
