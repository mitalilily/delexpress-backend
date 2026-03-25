"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTrackingEvent = logTrackingEvent;
const client_1 = require("../client");
const trackingEvents_1 = require("../schema/trackingEvents");
async function logTrackingEvent(params) {
    const { orderId, userId, awbNumber, courier, statusCode, statusText, location, raw } = params;
    await client_1.db.insert(trackingEvents_1.tracking_events).values({
        order_id: orderId,
        user_id: userId,
        awb_number: awbNumber || null,
        courier: courier || null,
        status_code: statusCode || null,
        status_text: statusText || null,
        location: location || null,
        raw: raw || null,
    });
}
