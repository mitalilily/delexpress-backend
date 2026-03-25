"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOrderShipment = cancelOrderShipment;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const delhivery_service_1 = require("./couriers/delhivery.service");
const ekart_service_1 = require("./couriers/ekart.service");
const xpressbees_service_1 = require("./couriers/xpressbees.service");
const webhookProcessor_1 = require("./webhookProcessor");
async function cancelOrderShipment(orderId) {
    console.log('🔍 Starting cancellation for orderId:', orderId);
    const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
    if (!order) {
        console.error('❌ Order not found:', orderId);
        throw new Error('Order not found');
    }
    console.log('📦 Order found:', {
        orderId: order.id,
        orderNumber: order.order_number,
        integrationType: order.integration_type,
        awbNumber: order.awb_number,
        shipmentId: order.shipment_id,
        currentStatus: order.order_status,
    });
    const integration = (order.integration_type || '').toLowerCase();
    if (!['delhivery', 'ekart', 'xpressbees'].includes(integration)) {
        console.error('❌ Unsupported integration type:', { orderId, integration });
        throw new Error('Only Delhivery, Ekart and Xpressbees are supported for cancellation');
    }
    if (!order.awb_number) {
        console.error('❌ Courier cancellation failed: Missing AWB number', { orderId, integration });
        throw new Error('Cancellation requires an AWB number');
    }
    console.log('🚚 Attempting courier cancellation:', {
        orderId,
        awbNumber: order.awb_number,
        integration,
    });
    let cancellationResult = null;
    if (integration === 'delhivery') {
        const svc = new delhivery_service_1.DelhiveryService();
        cancellationResult = await svc.cancelShipment(order.awb_number);
    }
    else if (integration === 'ekart') {
        const svc = new ekart_service_1.EkartService();
        cancellationResult = await svc.cancelShipment(order.awb_number);
    }
    else {
        const svc = new xpressbees_service_1.XpressbeesService();
        cancellationResult = await svc.cancelShipment(order.awb_number);
    }
    // Validate courier response
    // Check for various success indicators: boolean status, string status, success flags, or cancellation remark
    const isSuccess = cancellationResult?.success === true ||
        cancellationResult?.Success === true ||
        cancellationResult?.status === true || // Boolean true (most common)
        cancellationResult?.status === 'Success' ||
        cancellationResult?.status === 'success' ||
        cancellationResult?.response?.status === true ||
        (cancellationResult?.remark &&
            cancellationResult.remark.toLowerCase().includes('cancelled')) || // Check remark field for cancellation confirmation
        (cancellationResult?.message &&
            cancellationResult?.message.toLowerCase().includes('success') &&
            !cancellationResult?.error) ||
        (cancellationResult?.message &&
            cancellationResult?.message.toLowerCase().includes('cancelled') &&
            !cancellationResult?.error);
    console.log('🔍 Courier response validation:', {
        integration,
        isSuccess,
        success: cancellationResult?.success,
        Success: cancellationResult?.Success,
        status: cancellationResult?.status,
        statusType: typeof cancellationResult?.status,
        remark: cancellationResult?.remark,
        message: cancellationResult?.message,
        error: cancellationResult?.error,
        fullResponse: cancellationResult,
    });
    if (!isSuccess) {
        const errorMsg = cancellationResult?.error || cancellationResult?.message || 'Courier cancellation not accepted';
        console.error('❌ Courier cancellation failed:', {
            orderId,
            integration,
            response: cancellationResult,
            message: errorMsg,
        });
        throw new Error(errorMsg);
    }
    console.log('✅ Courier cancellation successful');
    const finalStatus = 'cancelled';
    console.log(`💾 Updating order status to ${finalStatus}:`, { orderId, integration });
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({ order_status: finalStatus, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
        await (0, webhookProcessor_1.applyCancellationRefundOnce)(tx, order, 'pickup_cancel_api');
    });
    console.log(`✅ Order status updated to ${finalStatus} successfully:`, { orderId, integration });
    return cancellationResult;
}
