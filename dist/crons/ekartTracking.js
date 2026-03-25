"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollEkartTracking = pollEkartTracking;
const drizzle_orm_1 = require("drizzle-orm");
const ekart_service_1 = require("../models/services/couriers/ekart.service");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const trackingEvents_service_1 = require("../models/services/trackingEvents.service");
const webhookDelivery_service_1 = require("../services/webhookDelivery.service");
const wallet_1 = require("../models/schema/wallet");
const wallet_service_1 = require("../models/services/wallet.service");
const terminalStatuses = ['delivered', 'cancelled', 'rto_delivered'];
const statusMap = {
    'order placed': 'booked',
    booked: 'booked',
    'pickup scheduled': 'pickup_initiated',
    'pickup booked': 'pickup_initiated',
    'in transit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    delivered: 'delivered',
    'delivery attempted': 'ndr',
    ndr: 'ndr',
    'return to origin': 'rto_initiated',
    'rto initiated': 'rto_initiated',
    'rto in transit': 'rto_in_transit',
    'rto delivered': 'rto_delivered',
    manifested: 'pickup_initiated',
};
function mapEkartStatus(raw) {
    if (!raw)
        return 'unknown';
    const norm = raw.toLowerCase();
    if (statusMap[norm])
        return statusMap[norm];
    if (norm.includes('out for delivery'))
        return 'out_for_delivery';
    if (norm.includes('attempt'))
        return 'ndr';
    if (norm.includes('rto') && norm.includes('transit'))
        return 'rto_in_transit';
    if (norm.includes('rto'))
        return 'rto_initiated';
    if (norm.includes('pickup'))
        return 'pickup_initiated';
    if (norm.includes('deliver'))
        return 'delivered';
    return 'in_transit';
}
async function pollEkartTracking(batchSize = 50) {
    const pending = await client_1.db
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.integration_type, 'ekart'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2cOrders_1.b2c_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2cOrders_1.b2c_orders.order_status))))
        .limit(batchSize);
    if (!pending.length) {
        return;
    }
    const ekart = new ekart_service_1.EkartService();
    for (const order of pending) {
        const awb = order.awb_number;
        if (!awb)
            continue;
        try {
            const track = await ekart.track(awb);
            const statusText = track?.track?.status || '';
            const mapped = mapEkartStatus(statusText);
            if (!mapped || mapped === 'unknown')
                continue;
            const prevStatus = order.order_status || '';
            await client_1.db
                .update(b2cOrders_1.b2c_orders)
                .set({ order_status: mapped, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            await (0, trackingEvents_service_1.logTrackingEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number ?? undefined,
                courier: 'Ekart',
                statusCode: mapped,
                statusText,
                location: track?.track?.location ?? '',
                raw: track,
            });
            await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'tracking.updated', {
                order_id: order.id,
                awb_number: order.awb_number,
                status: mapped,
                raw_status: statusText,
                courier_partner: order.courier_partner ?? 'Ekart',
            });
            if (mapped === 'rto_initiated' && prevStatus !== 'rto_initiated') {
                const [wallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, order.user_id));
                const amount = Number(order.freight_charges ?? order.shipping_charges ?? 0) || 0;
                if (wallet && amount > 0) {
                    const newBalance = Number(wallet.balance ?? 0) - amount;
                    await client_1.db
                        .update(wallet_1.wallets)
                        .set({ balance: newBalance.toString() })
                        .where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, wallet.id));
                    await (0, wallet_service_1.createWalletTransaction)({
                        walletId: wallet.id,
                        amount,
                        type: 'debit',
                        currency: wallet.currency ?? 'INR',
                        reason: `RTO freight - Ekart (${order.order_number})`,
                        meta: { awb: order.awb_number },
                        tx: client_1.db,
                    });
                }
            }
        }
        catch (err) {
            console.error(`❌ Ekart tracking failed for ${awb}:`, err?.message || err);
        }
    }
}
