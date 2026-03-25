"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordNdrEvent = recordNdrEvent;
exports.listNdrEvents = listNdrEvents;
exports.listNdrEventsAdmin = listNdrEventsAdmin;
exports.getNdrTimeline = getNdrTimeline;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const userProfile_1 = require("../schema/userProfile");
const ndr_1 = require("../schema/ndr");
const trackingEvents_1 = require("../schema/trackingEvents");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
async function recordNdrEvent(params) {
    const { orderId, userId, awbNumber, status, reason, remarks, attemptNo, payload } = params;
    const [inserted] = await client_1.db
        .insert(ndr_1.ndr_events)
        .values({
        order_id: orderId,
        user_id: userId,
        awb_number: awbNumber || null,
        status,
        reason: reason || null,
        remarks: remarks || null,
        attempt_no: attemptNo || null,
        payload: payload || null,
    })
        .returning();
    // 🔔 Send webhook event for NDR
    (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.ndr', {
        order_id: orderId,
        awb_number: awbNumber,
        status,
        reason,
        remarks,
        attempt_no: attemptNo,
        created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
    }).catch((err) => {
        console.error('Failed to send NDR webhook event:', err);
        // Don't fail the main flow if webhook fails
    });
    return inserted;
}
async function listNdrEvents(userId, orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const whereBase = orderId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId), (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, orderId))
        : (0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId);
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(ndr_1.ndr_events.awb_number, `%${search}%`), 
        // order_id is UUID → cast to text for ILIKE
        (0, drizzle_orm_1.sql) `(${ndr_1.ndr_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.remarks, `%${search}%`))
        : undefined;
    const parsedFrom = fromDate ? new Date(fromDate) : undefined;
    const parsedTo = toDate ? new Date(toDate) : undefined;
    const hasValidFrom = parsedFrom && !isNaN(parsedFrom.getTime());
    const hasValidTo = parsedTo && !isNaN(parsedTo.getTime());
    const dateWhere = hasValidFrom || hasValidTo
        ? (0, drizzle_orm_1.and)(hasValidFrom ? (0, drizzle_orm_1.gte)(ndr_1.ndr_events.created_at, parsedFrom) : (0, drizzle_orm_1.sql) `true`, hasValidTo ? (0, drizzle_orm_1.lte)(ndr_1.ndr_events.created_at, parsedTo) : (0, drizzle_orm_1.sql) `true`)
        : undefined;
    const where = searchWhere || dateWhere
        ? (0, drizzle_orm_1.and)(whereBase, searchWhere || (0, drizzle_orm_1.sql) `true`, dateWhere || (0, drizzle_orm_1.sql) `true`)
        : whereBase;
    const offset = (page - 1) * limit;
    const rows = await client_1.db
        .select({
        id: ndr_1.ndr_events.id,
        awb_number: ndr_1.ndr_events.awb_number,
        order_id: ndr_1.ndr_events.order_id,
        status: ndr_1.ndr_events.status,
        reason: ndr_1.ndr_events.reason,
        remarks: ndr_1.ndr_events.remarks,
        attempt_no: ndr_1.ndr_events.attempt_no,
        created_at: ndr_1.ndr_events.created_at,
        last_event_time: ndr_1.ndr_events.updated_at,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        integration_type: b2cOrders_1.b2c_orders.integration_type,
    })
        .from(ndr_1.ndr_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
        .limit(limit)
        .offset(offset);
    const [{ count }] = (await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(ndr_1.ndr_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
        .where(where));
    return { rows, totalCount: Number(count) || 0 };
}
async function listNdrEventsAdmin(orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate, courier, integration_type, attempt_count, status, } = params || {};
    const base = orderId ? (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, orderId) : (0, drizzle_orm_1.sql) `true`;
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(ndr_1.ndr_events.awb_number, `%${search}%`), 
        // order_id is UUID → cast to text for ILIKE
        (0, drizzle_orm_1.sql) `(${ndr_1.ndr_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.remarks, `%${search}%`))
        : undefined;
    const parsedFromA = fromDate ? new Date(fromDate) : undefined;
    const parsedToA = toDate ? new Date(toDate) : undefined;
    const hasValidFromA = parsedFromA && !isNaN(parsedFromA.getTime());
    const hasValidToA = parsedToA && !isNaN(parsedToA.getTime());
    const dateWhere = hasValidFromA || hasValidToA
        ? (0, drizzle_orm_1.and)(hasValidFromA ? (0, drizzle_orm_1.gte)(ndr_1.ndr_events.created_at, parsedFromA) : (0, drizzle_orm_1.sql) `true`, hasValidToA ? (0, drizzle_orm_1.lte)(ndr_1.ndr_events.created_at, parsedToA) : (0, drizzle_orm_1.sql) `true`)
        : undefined;
    const statusWhere = status ? (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.status, `%${status}%`) : undefined;
    // Build join with orders to filter by courier/integration_type and to project columns
    const whereFinal = (0, drizzle_orm_1.and)(base, searchWhere || (0, drizzle_orm_1.sql) `true`, dateWhere || (0, drizzle_orm_1.sql) `true`, statusWhere || (0, drizzle_orm_1.sql) `true`);
    const offset = (page - 1) * limit;
    const rows = await client_1.db
        .select({
        id: ndr_1.ndr_events.id,
        awb_number: ndr_1.ndr_events.awb_number,
        order_id: ndr_1.ndr_events.order_id,
        status: ndr_1.ndr_events.status,
        reason: ndr_1.ndr_events.reason,
        remarks: ndr_1.ndr_events.remarks,
        attempt_no: ndr_1.ndr_events.attempt_no,
        created_at: ndr_1.ndr_events.created_at,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        integration_type: b2cOrders_1.b2c_orders.integration_type,
        merchant_id: b2cOrders_1.b2c_orders.user_id,
        merchant_name: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyName')`.as('merchant_name'),
        last_event_time: ndr_1.ndr_events.updated_at,
    })
        .from(ndr_1.ndr_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, b2cOrders_1.b2c_orders.user_id))
        .where((0, drizzle_orm_1.and)(whereFinal, courier ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, `%${courier}%`) : (0, drizzle_orm_1.sql) `true`, integration_type ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.integration_type, `%${integration_type}%`) : (0, drizzle_orm_1.sql) `true`, attempt_count ? (0, drizzle_orm_1.eq)(ndr_1.ndr_events.attempt_no, String(attempt_count)) : (0, drizzle_orm_1.sql) `true`))
        .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
        .limit(limit)
        .offset(offset);
    const [{ count }] = (await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(ndr_1.ndr_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, b2cOrders_1.b2c_orders.user_id))
        .where((0, drizzle_orm_1.and)(whereFinal, courier ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, `%${courier}%`) : (0, drizzle_orm_1.sql) `true`, integration_type ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.integration_type, `%${integration_type}%`) : (0, drizzle_orm_1.sql) `true`, attempt_count ? (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.attempt_no, `%${String(attempt_count)}%`) : (0, drizzle_orm_1.sql) `true`)));
    return { rows, totalCount: Number(count) || 0 };
}
async function getNdrTimeline(params) {
    const { awb, orderId } = params;
    let orderRow = null;
    if (orderId) {
        const [o] = await client_1.db
            .select({ id: b2cOrders_1.b2c_orders.id, awb_number: b2cOrders_1.b2c_orders.awb_number })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId))
            .limit(1);
        if (o)
            orderRow = o;
    }
    else if (awb) {
        const [o] = await client_1.db
            .select({ id: b2cOrders_1.b2c_orders.id, awb_number: b2cOrders_1.b2c_orders.awb_number })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb))
            .limit(1);
        if (o)
            orderRow = o;
    }
    const resolvedOrderId = orderRow?.id;
    const resolvedAwb = orderRow?.awb_number || awb;
    // NDR events timeline
    const ndr = await client_1.db
        .select({
        type: (0, drizzle_orm_1.sql) `'ndr'`,
        at: ndr_1.ndr_events.created_at,
        status: ndr_1.ndr_events.status,
        remarks: ndr_1.ndr_events.remarks,
        reason: ndr_1.ndr_events.reason,
        attempt_no: ndr_1.ndr_events.attempt_no,
        raw: ndr_1.ndr_events.payload,
    })
        .from(ndr_1.ndr_events)
        .where(resolvedOrderId ? (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, resolvedOrderId) : (0, drizzle_orm_1.sql) `false`);
    // Tracking events timeline (optional)
    const tracking = resolvedAwb
        ? await client_1.db
            .select({
            type: (0, drizzle_orm_1.sql) `'tracking'`,
            at: trackingEvents_1.tracking_events.created_at,
            status: trackingEvents_1.tracking_events.status_code,
            remarks: trackingEvents_1.tracking_events.status_text,
            reason: (0, drizzle_orm_1.sql) `null`,
            attempt_no: (0, drizzle_orm_1.sql) `null`,
            raw: trackingEvents_1.tracking_events.raw,
        })
            .from(trackingEvents_1.tracking_events)
            .where((0, drizzle_orm_1.eq)(trackingEvents_1.tracking_events.awb_number, resolvedAwb))
        : [];
    const combined = [...ndr, ...tracking].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return { orderId: resolvedOrderId, awb: resolvedAwb, events: combined };
}
