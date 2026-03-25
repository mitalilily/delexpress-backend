"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReturnQuoteController = exports.createReturnOrderController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const reverse_service_1 = require("../../models/services/reverse.service");
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const wallet_service_1 = require("../../models/services/wallet.service");
const schema_1 = require("../../schema/schema");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
/**
 * Create a return order (reverse pickup)
 * POST /api/v1/returns
 */
const createReturnOrderController = async (req, res) => {
    try {
        const userId = req.userId;
        const body = req.body || {};
        const payload = {
            ...body,
            payment_type: 'reverse',
        };
        // Quote reverse charge and debit wallet
        let reverseCharge = 0;
        try {
            const orderId = body?.original_order_id || body?.order_id || body?.orderId;
            if (orderId) {
                const quote = await (0, reverse_service_1.quoteReverseForOrder)(orderId, Number(body?.package_weight));
                reverseCharge = Number(quote.rate || 0);
            }
        }
        catch (e) {
            // optional: keep zero if not found
        }
        if (reverseCharge > 0) {
            const [userWallet] = await client_1.db
                .select()
                .from(schema_1.wallets)
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, userId))
                .limit(1);
            if (!userWallet)
                throw new Error('Wallet not found');
            if (Number(userWallet.balance || 0) < reverseCharge) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient balance',
                    message: 'Insufficient wallet balance for reverse shipment',
                });
            }
            await (0, wallet_service_1.createWalletTransaction)({
                walletId: userWallet.id,
                amount: reverseCharge,
                type: 'debit',
                reason: 'reverse_shipment',
                meta: { order_number: payload.order_number },
            });
            payload.shipping_charges = reverseCharge;
        }
        const result = await (0, shiprocket_service_1.createB2CShipmentService)(payload, userId);
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
                error: 'Return order creation failed',
                message: 'Return order was created but could not be retrieved',
            });
        }
        // 🔔 Send webhook event for return order creation
        (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.return_created', {
            order_id: order.id,
            order_number: order.order_number,
            awb_number: order.awb_number,
            original_order_id: body?.original_order_id || body?.order_id || body?.orderId,
            status: order.order_status || 'booked',
            reverse_charge: reverseCharge,
            shipment_data: shipmentData,
        }).catch((err) => {
            console.error('Failed to send return order webhook:', err);
        });
        res.status(201).json({
            success: true,
            message: 'Return order created successfully',
            data: {
                order_id: order.id,
                order_number: order.order_number,
                awb_number: order.awb_number,
                status: order.order_status || 'booked',
                reverse_charge: reverseCharge,
                label: order.label,
                courier_partner: order.courier_partner,
            },
        });
    }
    catch (error) {
        console.error('Error creating return order via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create return order',
            message: error.message || 'Internal server error',
        });
    }
};
exports.createReturnOrderController = createReturnOrderController;
/**
 * Get quote for return order
 * GET /api/v1/returns/quote
 */
const getReturnQuoteController = async (req, res) => {
    try {
        const { orderId, weightGrams } = req.query;
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Missing parameter',
                message: 'orderId is required',
            });
        }
        const quote = await (0, reverse_service_1.quoteReverseForOrder)(orderId, weightGrams ? Number(weightGrams) : undefined);
        res.status(200).json({
            success: true,
            data: quote,
        });
    }
    catch (error) {
        console.error('Error getting return quote via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get return quote',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getReturnQuoteController = getReturnQuoteController;
