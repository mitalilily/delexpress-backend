"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminNdrKpis = exports.exportAdminNdrCsv = exports.getMyNdrTimeline = exports.getAdminNdrTimeline = exports.getAdminNdrEvents = exports.getMyNdrEvents = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const ndr_1 = require("../models/schema/ndr");
const ndr_service_1 = require("../models/services/ndr.service");
const csv_1 = require("../utils/csv");
const getMyNdrEvents = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { orderId, page, limit, search, fromDate, toDate, courier, integration_type, attempt_count, status, } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, ndr_service_1.listNdrEvents)(userId, orderId, {
            page: p,
            limit: l,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
        });
        res.json({ success: true, data: rows, totalCount });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.getMyNdrEvents = getMyNdrEvents;
const getAdminNdrEvents = async (req, res) => {
    try {
        const { orderId, page, limit, search, fromDate, toDate, courier, integration_type, attempt_count, status, } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, ndr_service_1.listNdrEventsAdmin)(orderId, {
            page: p,
            limit: l,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            courier: courier || undefined,
            integration_type: integration_type || undefined,
            attempt_count: attempt_count ? Number(attempt_count) : undefined,
            status: status || undefined,
        });
        res.json({ success: true, data: rows, totalCount });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrEvents = getAdminNdrEvents;
const getAdminNdrTimeline = async (req, res) => {
    try {
        const { awb, orderId } = req.query;
        if (!awb && !orderId) {
            return res.status(400).json({ success: false, message: 'Provide awb or orderId' });
        }
        const data = await (0, ndr_service_1.getNdrTimeline)({ awb, orderId });
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrTimeline = getAdminNdrTimeline;
const getMyNdrTimeline = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { awb, orderId } = req.query;
        if (!awb && !orderId) {
            return res.status(400).json({ success: false, message: 'Provide awb or orderId' });
        }
        let resolvedOrderId;
        if (orderId) {
            const [order] = await client_1.db
                .select({ id: b2cOrders_1.b2c_orders.id })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)))
                .limit(1);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            resolvedOrderId = order.id;
        }
        else if (awb) {
            const [order] = await client_1.db
                .select({ id: b2cOrders_1.b2c_orders.id })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)))
                .limit(1);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            resolvedOrderId = order.id;
        }
        const data = await (0, ndr_service_1.getNdrTimeline)({ orderId: resolvedOrderId });
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getMyNdrTimeline = getMyNdrTimeline;
const exportAdminNdrCsv = async (req, res) => {
    try {
        const { search, fromDate, toDate, courier, integration_type, attempt_count, status } = req.query;
        const where = (0, drizzle_orm_1.and)(search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `true`, (0, drizzle_orm_1.sql) `${ndr_1.ndr_events.awb_number} ILIKE ${'%' + search + '%'}`)
            : (0, drizzle_orm_1.sql) `true`, status ? (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.status, `%${status}%`) : (0, drizzle_orm_1.sql) `true`);
        const rows = await client_1.db
            .select({
            awb: ndr_1.ndr_events.awb_number,
            order_id: ndr_1.ndr_events.order_id,
            status: ndr_1.ndr_events.status,
            reason: ndr_1.ndr_events.reason,
            remarks: ndr_1.ndr_events.remarks,
            attempt_no: ndr_1.ndr_events.attempt_no,
            created_at: ndr_1.ndr_events.created_at,
            courier_partner: b2cOrders_1.b2c_orders.courier_partner,
            integration_type: b2cOrders_1.b2c_orders.integration_type,
        })
            .from(ndr_1.ndr_events)
            .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
            .where((0, drizzle_orm_1.and)(where, courier ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, `%${courier}%`) : (0, drizzle_orm_1.sql) `true`, integration_type
            ? (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.integration_type, `%${integration_type}%`)
            : (0, drizzle_orm_1.sql) `true`, attempt_count ? (0, drizzle_orm_1.ilike)(ndr_1.ndr_events.attempt_no, `%${String(attempt_count)}%`) : (0, drizzle_orm_1.sql) `true`, fromDate ? (0, drizzle_orm_1.sql) `${ndr_1.ndr_events.created_at} >= ${new Date(fromDate)}` : (0, drizzle_orm_1.sql) `true`, toDate ? (0, drizzle_orm_1.sql) `${ndr_1.ndr_events.created_at} <= ${new Date(toDate)}` : (0, drizzle_orm_1.sql) `true`));
        const headers = [
            'AWB',
            'OrderId',
            'Courier',
            'Integration',
            'Status',
            'Reason',
            'Remarks',
            'AttemptNo',
            'CreatedAt',
        ];
        const csv = (0, csv_1.buildCsv)(headers, rows.map((r) => [
            r.awb,
            r.order_id,
            r.courier_partner,
            r.integration_type,
            r.status,
            r.reason,
            r.remarks,
            r.attempt_no,
            r.created_at?.toISOString?.(),
        ]));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ndr_export.csv"`);
        return res.status(200).send(csv);
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.exportAdminNdrCsv = exportAdminNdrCsv;
const getAdminNdrKpis = async (req, res) => {
    try {
        // Simple KPIs: total NDRs, by status, by courier, unique orders affected
        const [{ total }] = (await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)` }).from(ndr_1.ndr_events));
        const byStatus = (await client_1.db
            .select({ status: ndr_1.ndr_events.status, count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(ndr_1.ndr_events)
            .groupBy(ndr_1.ndr_events.status));
        const byCourier = (await client_1.db
            .select({ courier: b2cOrders_1.b2c_orders.courier_partner, count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(ndr_1.ndr_events)
            .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, b2cOrders_1.b2c_orders.id))
            .groupBy(b2cOrders_1.b2c_orders.courier_partner));
        const [{ ordersAffected }] = (await client_1.db
            .select({ ordersAffected: (0, drizzle_orm_1.sql) `count(distinct ${ndr_1.ndr_events.order_id})` })
            .from(ndr_1.ndr_events));
        return res
            .status(200)
            .json({ success: true, data: { total, byStatus, byCourier, ordersAffected } });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrKpis = getAdminNdrKpis;
