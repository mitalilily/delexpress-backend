"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const apiKey_controller_1 = require("../controllers/externalApi/apiKey.controller");
const manifest_controller_1 = require("../controllers/externalApi/manifest.controller");
const ekart_webhook_1 = require("../controllers/webhooks/ekart.webhook");
const ndr_controller_1 = require("../controllers/externalApi/ndr.controller");
const order_controller_1 = require("../controllers/externalApi/order.controller");
const pickup_controller_1 = require("../controllers/externalApi/pickup.controller");
const returns_controller_1 = require("../controllers/externalApi/returns.controller");
const rto_controller_1 = require("../controllers/externalApi/rto.controller");
const serviceability_controller_1 = require("../controllers/externalApi/serviceability.controller");
const shipping_controller_1 = require("../controllers/externalApi/shipping.controller");
const webhook_controller_1 = require("../controllers/externalApi/webhook.controller");
const requireApiKey_1 = require("../middlewares/requireApiKey");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// ============================================================================
// API KEY MANAGEMENT (Requires User Auth - Frontend Dashboard)
// ============================================================================
router.post('/api-keys', requireAuth_1.requireAuth, apiKey_controller_1.createApiKeyController);
router.get('/api-keys', requireAuth_1.requireAuth, apiKey_controller_1.listApiKeysController);
router.put('/api-keys/:id', requireAuth_1.requireAuth, apiKey_controller_1.updateApiKeyController);
router.delete('/api-keys/:id', requireAuth_1.requireAuth, apiKey_controller_1.deleteApiKeyController);
// ============================================================================
// WEBHOOK MANAGEMENT (Requires User Auth - Frontend Dashboard)
// ============================================================================
router.post('/webhooks', requireAuth_1.requireAuth, webhook_controller_1.createWebhookController);
router.get('/webhooks', requireAuth_1.requireAuth, webhook_controller_1.listWebhooksController);
router.get('/webhooks/:id', requireAuth_1.requireAuth, webhook_controller_1.getWebhookController);
router.put('/webhooks/:id', requireAuth_1.requireAuth, webhook_controller_1.updateWebhookController);
router.delete('/webhooks/:id', requireAuth_1.requireAuth, webhook_controller_1.deleteWebhookController);
router.post('/webhooks/:id/regenerate-secret', requireAuth_1.requireAuth, webhook_controller_1.regenerateWebhookSecretController);
// Provider webhook (Ekart) for partners who want to post directly
router.post('/webhook/ekart/track', ekart_webhook_1.ekartWebhookHandler);
// ============================================================================
// SHIPPING & SERVICEABILITY (Requires API Key)
// ============================================================================
// Check pincode serviceability and get available couriers
router.get('/serviceability', requireApiKey_1.requireApiKey, serviceability_controller_1.checkServiceabilityController);
router.post('/serviceability', requireApiKey_1.requireApiKey, serviceability_controller_1.checkServiceabilityController);
// Get shipping rates (pre-order calculation)
router.post('/shipping/rates', requireApiKey_1.requireApiKey, shipping_controller_1.getShippingRatesController);
// ============================================================================
// ORDER MANAGEMENT (Requires API Key)
// ============================================================================
// Create order
router.post('/orders', requireApiKey_1.requireApiKey, order_controller_1.createOrderController);
// List orders
router.get('/orders', requireApiKey_1.requireApiKey, order_controller_1.getOrdersController);
// Track order
router.get('/orders/track', requireApiKey_1.requireApiKey, order_controller_1.trackOrderController);
// Get order details
router.get('/orders/:orderId', requireApiKey_1.requireApiKey, order_controller_1.getOrderController);
// Cancel order
router.post('/orders/:orderId/cancel', requireApiKey_1.requireApiKey, order_controller_1.cancelOrderController);
// Retry failed manifest
router.post('/orders/:orderId/retry-manifest', requireApiKey_1.requireApiKey, order_controller_1.retryFailedManifestController);
// Get shipping label
router.get('/orders/:orderId/label', requireApiKey_1.requireApiKey, order_controller_1.getOrderLabelController);
// ============================================================================
// MANIFEST MANAGEMENT (Requires API Key)
// ============================================================================
router.post('/manifest', requireApiKey_1.requireApiKey, manifest_controller_1.generateManifestController);
// ============================================================================
// PICKUP MANAGEMENT (Requires API Key)
// ============================================================================
router.post('/pickup-addresses', requireApiKey_1.requireApiKey, pickup_controller_1.createPickupAddressController);
router.get('/pickup-addresses', requireApiKey_1.requireApiKey, pickup_controller_1.getPickupAddressesController);
router.put('/pickup-addresses/:id', requireApiKey_1.requireApiKey, pickup_controller_1.updatePickupAddressController);
router.post('/pickup-addresses/request-pickup', requireApiKey_1.requireApiKey, pickup_controller_1.requestPickupController);
// ============================================================================
// NDR MANAGEMENT (Requires API Key)
// ============================================================================
router.get('/ndr', requireApiKey_1.requireApiKey, ndr_controller_1.getNdrEventsController);
router.get('/ndr/timeline', requireApiKey_1.requireApiKey, ndr_controller_1.getNdrTimelineController);
// ============================================================================
// RTO MANAGEMENT (Requires API Key)
// ============================================================================
router.get('/rto', requireApiKey_1.requireApiKey, rto_controller_1.getRtoEventsController);
// ============================================================================
// RETURN ORDERS (Requires API Key)
// ============================================================================
router.post('/returns', requireApiKey_1.requireApiKey, returns_controller_1.createReturnOrderController);
router.get('/returns/quote', requireApiKey_1.requireApiKey, returns_controller_1.getReturnQuoteController);
exports.default = router;
