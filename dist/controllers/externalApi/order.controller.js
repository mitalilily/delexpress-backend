"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderLabelController = exports.cancelOrderController = exports.trackOrderController = exports.retryFailedManifestController = exports.getOrderController = exports.getOrdersController = exports.createOrderController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const delhivery_service_1 = require("../../models/services/couriers/delhivery.service");
const ekart_service_1 = require("../../models/services/couriers/ekart.service");
const xpressbees_service_1 = require("../../models/services/couriers/xpressbees.service");
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const upload_service_1 = require("../../models/services/upload.service");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const schema_1 = require("../../schema/schema");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const externalApiHelpers_1 = require("../../utils/externalApiHelpers");
/**
 * Create a B2C order via external API
 * POST /api/v1/orders
 */
const createOrderController = async (req, res) => {
    try {
        const userId = req.userId; // From requireApiKey middleware
        const params = req.body;
        // Validate required fields
        if (!params.order_number || !params.consignee || !params.order_items?.length) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                message: 'order_number, consignee, and order_items are required',
            });
        }
        // Create the shipment (via external API, so is_external_api = true)
        const result = await (0, shiprocket_service_1.createB2CShipmentService)(params, userId, true);
        const { order: newOrder, shipment: shipmentData } = result;
        // Fetch the full order data
        const [order] = await client_1.db
            .select()
            .from(schema_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(schema_1.b2c_orders.id, newOrder.id))
            .limit(1);
        if (!order) {
            return res.status(500).json({
                success: false,
                error: 'Order creation failed',
                message: 'Order was created but could not be retrieved',
            });
        }
        // Send webhook event
        await (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.created', {
            order_id: order.id,
            order_number: order.order_number,
            awb_number: order.awb_number,
            status: order.order_status || 'booked',
            shipment_data: shipmentData,
        });
        // Delhivery manifestation is part of shipment creation.
        const createManifest = false;
        // Generate opaque provider code to hide actual integration_type from external API users
        const providerCode = (0, externalApiHelpers_1.getOpaqueProviderCode)(order.integration_type);
        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                order_id: order.id,
                order_number: order.order_number,
                awb_number: order.awb_number,
                status: order.order_status || 'booked',
                label: order.label,
                courier_partner: order.courier_partner,
                createManifest: createManifest,
                provider_code: providerCode, // Opaque code - users cannot determine actual provider
            },
        });
    }
    catch (error) {
        console.error('Error creating order via API:', error);
        res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            error: 'Failed to create order',
            message: error.message || 'Internal server error',
        });
    }
};
exports.createOrderController = createOrderController;
/**
 * Get orders list
 * GET /api/v1/orders
 */
const getOrdersController = async (req, res) => {
    try {
        const userId = req.userId;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const filters = {
            status: req.query.status,
            type: req.query.type,
            courier: req.query.courier,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
        };
        const { orders, totalCount, totalPages } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, page, limit, filters);
        res.status(200).json({
            success: true,
            data: orders,
            pagination: {
                page,
                limit,
                total: totalCount,
                totalPages,
            },
        });
    }
    catch (error) {
        console.error('Error fetching orders via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch orders',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getOrdersController = getOrdersController;
/**
 * Get order by ID or order number
 * GET /api/v1/orders/:orderId
 */
const getOrderController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId } = req.params;
        // Try to get order by order_number or order_id
        const { orders } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, 1, 1, {
            search: orderId,
        });
        const order = orders.find((o) => o.order_number === orderId || o.order_id === orderId || o.id === orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                message: `Order with ID ${orderId} not found`,
            });
        }
        res.status(200).json({
            success: true,
            data: order,
        });
    }
    catch (error) {
        console.error('Error fetching order via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch order',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getOrderController = getOrderController;
const retryFailedManifestController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId } = req.params;
        const result = await (0, shiprocket_service_1.retryFailedManifestService)(String(orderId), userId);
        res.status(200).json({
            success: true,
            message: 'Manifest retry completed successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error retrying failed manifest via API:', error);
        res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            error: 'Failed to retry manifest',
            message: error?.message || 'Internal server error',
        });
    }
};
exports.retryFailedManifestController = retryFailedManifestController;
/**
 * Track order by AWB or order number
 * GET /api/v1/orders/track
 */
const trackOrderController = async (req, res) => {
    try {
        const { awb, orderNumber, contact } = req.query;
        let awbNumber = awb ? String(awb) : undefined;
        if (!awbNumber && orderNumber && contact) {
            const contactStr = String(contact);
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr);
            const isPhone = /^\d{7,15}$/.test(contactStr);
            if (!isEmail && !isPhone) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid contact',
                    message: 'Contact must be a valid email or phone number',
                });
            }
            const orderData = await (0, shiprocket_service_1.trackByOrderService)({
                orderNumber: String(orderNumber),
                email: isEmail ? contactStr : undefined,
                phone: isPhone ? contactStr : undefined,
            });
            awbNumber = orderData?.awb_number ?? '';
            if (!awbNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'AWB not found',
                    message: 'AWB number not found for this order',
                });
            }
        }
        if (awbNumber) {
            const trackingData = await (0, shiprocket_service_1.trackByAwbService)(awbNumber);
            return res.json({
                success: true,
                data: trackingData,
            });
        }
        return res.status(400).json({
            success: false,
            error: 'Missing parameters',
            message: "Provide either 'awb' or ('orderNumber' with 'contact')",
        });
    }
    catch (err) {
        console.error('Error tracking order via API:', err);
        return res.status(500).json({
            success: false,
            error: 'Failed to track order',
            message: err.message || 'Internal server error',
        });
    }
};
exports.trackOrderController = trackOrderController;
/**
 * Cancel an order
 * POST /api/v1/orders/:orderId/cancel
 */
const cancelOrderController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId } = req.params;
        const { reason } = req.body;
        // Find the order
        const { orders } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, 1, 1, {
            search: orderId,
        });
        const order = orders.find((o) => o.order_number === orderId || o.order_id === orderId || o.id === orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                message: `Order with ID ${orderId} not found`,
            });
        }
        // Check if order can be cancelled
        const cancellableStatuses = ['booked', 'pending', 'confirmed', 'pickup_initiated'];
        if (!cancellableStatuses.includes(order.order_status?.toLowerCase() || '')) {
            return res.status(400).json({
                success: false,
                error: 'Order cannot be cancelled',
                message: `Order with status "${order.order_status}" cannot be cancelled`,
            });
        }
        let cancellationResult = null;
        const provider = String(order.integration_type || '').toLowerCase();
        if (!['delhivery', 'ekart', 'xpressbees'].includes(provider)) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported provider',
                message: `Only Delhivery, Ekart and Xpressbees are supported for cancellation. Found: ${order.integration_type}`,
            });
        }
        if (!order.awb_number) {
            return res.status(400).json({
                success: false,
                error: 'Missing AWB',
                message: 'Cancellation requires an AWB number',
            });
        }
        try {
            if (provider === 'delhivery') {
                const delhivery = new delhivery_service_1.DelhiveryService();
                cancellationResult = await delhivery.cancelShipment(order.awb_number);
            }
            else if (provider === 'ekart') {
                const ekart = new ekart_service_1.EkartService();
                cancellationResult = await ekart.cancelShipment(order.awb_number);
            }
            else {
                const xpressbees = new xpressbees_service_1.XpressbeesService();
                cancellationResult = await xpressbees.cancelShipment(order.awb_number);
            }
        }
        catch (err) {
            console.error('Courier cancellation error:', err);
            return res.status(502).json({
                success: false,
                error: 'Courier cancellation failed',
                message: err?.message || 'Courier cancellation failed',
            });
        }
        const providerCancelAccepted = cancellationResult?.success === true ||
            cancellationResult?.Success === true ||
            cancellationResult?.status === true ||
            cancellationResult?.status === 'Success' ||
            cancellationResult?.status === 'success' ||
            cancellationResult?.response?.status === true ||
            (typeof cancellationResult?.remark === 'string' &&
                cancellationResult.remark.toLowerCase().includes('cancelled')) ||
            (typeof cancellationResult?.message === 'string' &&
                cancellationResult.message.toLowerCase().includes('cancelled') &&
                !cancellationResult?.error);
        if (!providerCancelAccepted) {
            return res.status(502).json({
                success: false,
                error: 'Courier cancellation rejected',
                message: cancellationResult?.error ||
                    cancellationResult?.message ||
                    'Delhivery did not confirm cancellation',
                data: {
                    provider: 'delhivery',
                    awb_number: order.awb_number,
                    provider_response: cancellationResult,
                },
            });
        }
        await client_1.db.transaction(async (tx) => {
            await tx
                .update(schema_1.b2c_orders)
                .set({
                order_status: 'cancelled',
                updated_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.b2c_orders.id, order.id));
            await (0, webhookProcessor_1.applyCancellationRefundOnce)(tx, order, 'cancel_api');
        });
        // Send webhook event
        await (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.cancelled', {
            order_id: order.id,
            order_number: order.order_number,
            awb_number: order.awb_number,
            status: 'cancelled',
            cancellation_reason: reason || 'Cancelled via API',
            cancelled_at: new Date().toISOString(),
        });
        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            data: {
                order_id: order.id,
                order_number: order.order_number,
                awb_number: order.awb_number,
                status: 'cancelled',
                cancellation_reason: reason || 'Cancelled via API',
            },
        });
    }
    catch (error) {
        console.error('Error cancelling order via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel order',
            message: error.message || 'Internal server error',
        });
    }
};
exports.cancelOrderController = cancelOrderController;
/**
 * Get shipping label for an order
 * GET /api/v1/orders/:orderId/label
 */
const getOrderLabelController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId } = req.params;
        // Find the order
        const { orders } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, 1, 1, {
            search: orderId,
        });
        const order = orders.find((o) => o.order_number === orderId || o.order_id === orderId || o.id === orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                message: `Order with ID ${orderId} not found`,
            });
        }
        if (!order.label) {
            return res.status(404).json({
                success: false,
                error: 'Label not found',
                message: 'Shipping label has not been generated for this order',
            });
        }
        // Generate presigned URL for label
        let labelUrl;
        try {
            const signed = await (0, upload_service_1.presignDownload)(order.label);
            labelUrl = Array.isArray(signed) ? signed[0] || order.label : signed;
        }
        catch (err) {
            // Fallback to stored URL if presigning fails
            labelUrl = order.label;
        }
        res.status(200).json({
            success: true,
            data: {
                order_id: order.id,
                order_number: order.order_number,
                awb_number: order.awb_number,
                label_url: labelUrl,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
            },
        });
    }
    catch (error) {
        console.error('Error fetching label via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch label',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getOrderLabelController = getOrderLabelController;
