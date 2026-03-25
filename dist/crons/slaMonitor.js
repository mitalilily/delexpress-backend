"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorSlaAndOda = monitorSlaAndOda;
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const trackingEvents_1 = require("../models/schema/trackingEvents");
const notifications_service_1 = require("../models/services/notifications.service");
// Basic thresholds
const IN_TRANSIT_SLA_HOURS = 72;
async function monitorSlaAndOda() {
    const now = (0, dayjs_1.default)();
    // Find orders still in transit for > SLA hours
    const cutoff = now.subtract(IN_TRANSIT_SLA_HOURS, 'hour').toDate();
    const inTransitOrders = await client_1.db
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_status, 'in_transit'));
    for (const order of inTransitOrders) {
        const events = await client_1.db
            .select()
            .from(trackingEvents_1.tracking_events)
            .where((0, drizzle_orm_1.eq)(trackingEvents_1.tracking_events.order_id, order.id))
            .orderBy((0, drizzle_orm_1.desc)(trackingEvents_1.tracking_events.created_at));
        const lastEvent = events?.[0];
        const lastTime = lastEvent?.created_at ? new Date(lastEvent.created_at) : order.updated_at;
        if (lastTime && lastTime < cutoff) {
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'SLA breach risk',
                message: `Order ${order.order_number} is in transit beyond ${IN_TRANSIT_SLA_HOURS}h.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'SLA breach risk',
                message: `User ${order.user_id} order ${order.order_number} is delayed.`,
            });
        }
        // ODA heuristic: status_text contains ODA or message has ODA
        const hadODA = events?.some((e) => (e.status_text || '').toLowerCase().includes('oda') ||
            e.raw?.message?.toLowerCase?.().includes('oda'));
        if (hadODA) {
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'ODA Area Notice',
                message: `Order ${order.order_number} flagged as ODA by courier. Expect delays.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'ODA flagged',
                message: `User ${order.user_id} order ${order.order_number} flagged ODA.`,
            });
        }
    }
}
