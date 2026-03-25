"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRtoEvent = recordRtoEvent;
exports.listRtoEvents = listRtoEvents;
exports.listRtoEventsAdmin = listRtoEventsAdmin;
exports.adminRtoKpis = adminRtoKpis;
exports.adminRtoExport = adminRtoExport;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const rto_1 = require("../schema/rto");
const b2cOrders_1 = require("../schema/b2cOrders");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const csv_1 = require("../../utils/csv");
async function recordRtoEvent(params) {
    const { orderId, userId, awbNumber, status, reason, remarks, rtoCharges, payload } = params;
    const [inserted] = await client_1.db
        .insert(rto_1.rto_events)
        .values({
        order_id: orderId,
        user_id: userId,
        awb_number: awbNumber || null,
        status,
        reason: reason || null,
        remarks: remarks || null,
        rto_charges: rtoCharges || null,
        payload: payload || null,
    })
        .returning();
    // 🔔 Send webhook event for RTO
    (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.rto', {
        order_id: orderId,
        awb_number: awbNumber,
        status,
        reason,
        remarks,
        rto_charges: rtoCharges,
        created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
    }).catch((err) => {
        console.error('Failed to send RTO webhook event:', err);
        // Don't fail the main flow if webhook fails
    });
    return inserted;
}
async function listRtoEvents(userId, orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const whereBase = orderId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId), (0, drizzle_orm_1.eq)(rto_1.rto_events.order_id, orderId))
        : (0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId);
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(rto_1.rto_events.awb_number, `%${search}%`), (0, drizzle_orm_1.sql) `(${rto_1.rto_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(rto_1.rto_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(rto_1.rto_events.remarks, `%${search}%`))
        : undefined;
    const dateWhere = fromDate || toDate
        ? (0, drizzle_orm_1.and)(fromDate ? (0, drizzle_orm_1.gte)(rto_1.rto_events.created_at, new Date(fromDate)) : (0, drizzle_orm_1.sql) `true`, toDate ? (0, drizzle_orm_1.lte)(rto_1.rto_events.created_at, new Date(toDate)) : (0, drizzle_orm_1.sql) `true`)
        : undefined;
    const where = searchWhere || dateWhere ? (0, drizzle_orm_1.and)(whereBase, searchWhere || (0, drizzle_orm_1.sql) `true`, dateWhere || (0, drizzle_orm_1.sql) `true`) : whereBase;
    const offset = (page - 1) * limit;
    const rows = await client_1.db
        .select()
        .from(rto_1.rto_events)
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(rto_1.rto_events.created_at))
        .limit(limit)
        .offset(offset);
    const [{ count }] = (await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(rto_1.rto_events)
        .where(where));
    return { rows, totalCount: Number(count) || 0 };
}
async function listRtoEventsAdmin(orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const whereBase = orderId ? (0, drizzle_orm_1.eq)(rto_1.rto_events.order_id, orderId) : (0, drizzle_orm_1.sql) `true`;
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(rto_1.rto_events.awb_number, `%${search}%`), (0, drizzle_orm_1.sql) `(${rto_1.rto_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(rto_1.rto_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(rto_1.rto_events.remarks, `%${search}%`))
        : undefined;
    const dateWhere = fromDate || toDate
        ? (0, drizzle_orm_1.and)(fromDate ? (0, drizzle_orm_1.gte)(rto_1.rto_events.created_at, new Date(fromDate)) : (0, drizzle_orm_1.sql) `true`, toDate ? (0, drizzle_orm_1.lte)(rto_1.rto_events.created_at, new Date(toDate)) : (0, drizzle_orm_1.sql) `true`)
        : undefined;
    const where = searchWhere || dateWhere ? (0, drizzle_orm_1.and)(whereBase, searchWhere || (0, drizzle_orm_1.sql) `true`, dateWhere || (0, drizzle_orm_1.sql) `true`) : whereBase;
    const offset = (page - 1) * limit;
    const rows = await client_1.db
        .select()
        .from(rto_1.rto_events)
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(rto_1.rto_events.created_at))
        .limit(limit)
        .offset(offset);
    const [{ count }] = (await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(rto_1.rto_events)
        .where(where));
    return { rows, totalCount: Number(count) || 0 };
}
async function adminRtoKpis(params) {
    const { search = '', fromDate, toDate } = params || {};
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(rto_1.rto_events.awb_number, `%${search}%`), (0, drizzle_orm_1.sql) `(${rto_1.rto_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(rto_1.rto_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(rto_1.rto_events.remarks, `%${search}%`))
        : (0, drizzle_orm_1.sql) `true`;
    const dateWhere = fromDate || toDate
        ? (0, drizzle_orm_1.and)(fromDate ? (0, drizzle_orm_1.gte)(rto_1.rto_events.created_at, new Date(fromDate)) : (0, drizzle_orm_1.sql) `true`, toDate ? (0, drizzle_orm_1.lte)(rto_1.rto_events.created_at, new Date(toDate)) : (0, drizzle_orm_1.sql) `true`)
        : (0, drizzle_orm_1.sql) `true`;
    // Totals
    const [{ total }] = (await client_1.db
        .select({ total: (0, drizzle_orm_1.sql) `count(*)` })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)(searchWhere, dateWhere)));
    // By status
    const byStatus = await client_1.db
        .select({ status: rto_1.rto_events.status, count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)(searchWhere, dateWhere))
        .groupBy(rto_1.rto_events.status);
    // Sum charges
    const [{ sumCharges }] = (await client_1.db
        .select({ sumCharges: (0, drizzle_orm_1.sql) `coalesce(sum(${rto_1.rto_events.rto_charges}), 0)` })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)(searchWhere, dateWhere)));
    // By courier (join orders)
    const byCourier = await client_1.db
        .select({
        courier: b2cOrders_1.b2c_orders.courier_partner,
        count: (0, drizzle_orm_1.sql) `count(*)`,
    })
        .from(rto_1.rto_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, rto_1.rto_events.order_id))
        .where((0, drizzle_orm_1.and)(searchWhere, dateWhere))
        .groupBy(b2cOrders_1.b2c_orders.courier_partner);
    return {
        total: Number(total) || 0,
        totalCharges: Number(sumCharges) || 0,
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.count) || 0 })),
        byCourier: byCourier.map((r) => ({ courier: r.courier || 'Unknown', count: Number(r.count) || 0 })),
    };
}
async function adminRtoExport(params) {
    const { search = '', fromDate, toDate } = params || {};
    const searchWhere = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(rto_1.rto_events.awb_number, `%${search}%`), (0, drizzle_orm_1.sql) `(${rto_1.rto_events.order_id}::text) ILIKE ${`%${search}%`}`, (0, drizzle_orm_1.ilike)(rto_1.rto_events.reason, `%${search}%`), (0, drizzle_orm_1.ilike)(rto_1.rto_events.remarks, `%${search}%`))
        : (0, drizzle_orm_1.sql) `true`;
    const dateWhere = fromDate || toDate
        ? (0, drizzle_orm_1.and)(fromDate ? (0, drizzle_orm_1.gte)(rto_1.rto_events.created_at, new Date(fromDate)) : (0, drizzle_orm_1.sql) `true`, toDate ? (0, drizzle_orm_1.lte)(rto_1.rto_events.created_at, new Date(toDate)) : (0, drizzle_orm_1.sql) `true`)
        : (0, drizzle_orm_1.sql) `true`;
    const rows = await client_1.db
        .select({
        created_at: rto_1.rto_events.created_at,
        awb_number: rto_1.rto_events.awb_number,
        order_id: rto_1.rto_events.order_id,
        status: rto_1.rto_events.status,
        reason: rto_1.rto_events.reason,
        remarks: rto_1.rto_events.remarks,
        rto_charges: rto_1.rto_events.rto_charges,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
    })
        .from(rto_1.rto_events)
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, rto_1.rto_events.order_id))
        .where((0, drizzle_orm_1.and)(searchWhere, dateWhere))
        .orderBy((0, drizzle_orm_1.desc)(rto_1.rto_events.created_at));
    // Build CSV
    const headers = [
        'Created At',
        'AWB',
        'Order ID',
        'Status',
        'Reason',
        'Remarks',
        'RTO Charges',
        'Courier',
    ];
    const rowsData = rows.map((r) => [
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.awb_number || '',
        r.order_id || '',
        r.status || '',
        r.reason || '',
        r.remarks || '',
        r.rto_charges != null ? Number(r.rto_charges) : '',
        r.courier_partner || '',
    ]);
    return (0, csv_1.buildCsv)(headers, rowsData);
}
