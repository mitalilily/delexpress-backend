"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelShipment = void 0;
const pickup_service_1 = require("../models/services/pickup.service");
const cancelShipment = async (req, res) => {
    try {
        const { orderId } = req.body;
        console.log('📋 Cancellation Request:', {
            orderId,
            userId: req.user?.sub,
            timestamp: new Date().toISOString(),
        });
        if (!orderId) {
            console.error('❌ Cancellation failed: Missing orderId');
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, pickup_service_1.cancelOrderShipment)(orderId);
        console.log('✅ Cancellation Success Response:', {
            orderId,
            result: JSON.stringify(result, null, 2),
        });
        res.json({
            success: true,
            message: 'Order cancellation requested successfully',
            result
        });
    }
    catch (e) {
        console.error('❌ Cancellation Error:', {
            orderId: req.body?.orderId,
            error: e.message,
            stack: e.stack,
            response: e.response?.data,
            status: e.response?.status,
            fullError: JSON.stringify(e, null, 2),
        });
        const errorMessage = e.message || 'Failed to cancel order';
        const statusCode = e.response?.status || 400;
        res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: e.response?.data || e.message,
        });
    }
};
exports.cancelShipment = cancelShipment;
