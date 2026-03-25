"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCustomReportCsvController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const codRemittance_1 = require("../models/schema/codRemittance");
const ndr_1 = require("../models/schema/ndr");
const csv_1 = require("../utils/csv");
const FIELD_LABELS = {
    order_number: 'order_number',
    order_date: 'order_date',
    order_amount: 'order_amount',
    order_type: 'order_type',
    buyer_name: 'buyer_name',
    buyer_phone: 'buyer_phone',
    buyer_email: 'buyer_email',
    address: 'address',
    city: 'city',
    state: 'state',
    pincode: 'pincode',
    weight: 'weight',
    length: 'length',
    height: 'height',
    breadth: 'breadth',
    order_status: 'order_status',
    freight_charges: 'freight_charges',
    discount: 'discount',
    products: 'products',
    shipment_date: 'shipment_date',
    awb_number: 'awb_number',
    shipment_status: 'shipment_status',
    remittance_id: 'remittance_id',
    pickup_time: 'pickup_time',
    delivered_time: 'delivered_time',
    charged_weight: 'charged_weight',
    zone: 'zone',
    last_status_updated: 'last_status_updated',
    ndr_attempts_info: 'ndr_attempts_info',
};
const DEFAULT_FIELDS = Object.keys(FIELD_LABELS);
const parseDate = (value) => {
    if (!value)
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};
const endOfDay = (d) => {
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
};
const toNumber = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const formatProducts = (products) => {
    if (!Array.isArray(products) || products.length === 0)
        return '';
    return products
        .map((p) => {
        const name = p?.name || p?.productName || p?.box_name || 'Item';
        const qty = p?.qty ?? p?.quantity ?? 1;
        const price = toNumber(p?.price);
        return `${name} x${qty} (Rs. ${price.toFixed(2)})`;
    })
        .join(' | ');
};
const stringifyDate = (v) => {
    if (!v)
        return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
        return String(v);
    return d.toISOString();
};
const getNdrAttemptSummary = (events) => {
    if (!events.length)
        return '';
    const latest = events[events.length - 1];
    const attempts = Array.from(new Set(events.map((e) => e.attempt_no).filter((x) => !!x && x.trim() !== '')));
    const attemptsText = attempts.length ? attempts.join('/') : String(events.length);
    return `Attempts: ${attemptsText}; Latest: ${latest.status}${latest.reason ? ` (${latest.reason})` : ''}`;
};
const exportCustomReportCsvController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { fromDate, toDate: toDateStr, selectedFields, } = req.body || {};
        const from = parseDate(fromDate);
        const to = parseDate(toDateStr);
        if (!from || !to) {
            return res.status(400).json({ success: false, message: 'Valid fromDate and toDate are required' });
        }
        const fields = Array.isArray(selectedFields) && selectedFields.length
            ? selectedFields.filter((f) => FIELD_LABELS[f])
            : DEFAULT_FIELDS;
        if (!fields.length) {
            return res.status(400).json({ success: false, message: 'At least one field must be selected' });
        }
        const dateClauseB2C = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.gte)(b2cOrders_1.b2c_orders.created_at, from), (0, drizzle_orm_1.lte)(b2cOrders_1.b2c_orders.created_at, endOfDay(to)));
        const dateClauseB2B = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.gte)(b2bOrders_1.b2b_orders.created_at, from), (0, drizzle_orm_1.lte)(b2bOrders_1.b2b_orders.created_at, endOfDay(to)));
        const [b2cRows, b2bRows] = await Promise.all([
            client_1.db.select().from(b2cOrders_1.b2c_orders).where(dateClauseB2C).orderBy((0, drizzle_orm_1.asc)(b2cOrders_1.b2c_orders.created_at)),
            client_1.db.select().from(b2bOrders_1.b2b_orders).where(dateClauseB2B).orderBy((0, drizzle_orm_1.asc)(b2bOrders_1.b2b_orders.created_at)),
        ]);
        const b2cIds = b2cRows.map((r) => r.id);
        const allOrderRefs = [
            ...b2cRows.map((r) => ({ orderId: r.id, orderType: 'b2c' })),
            ...b2bRows.map((r) => ({ orderId: r.id, orderType: 'b2b' })),
        ];
        const [ndrRows, remRows] = await Promise.all([
            b2cIds.length
                ? client_1.db
                    .select({
                    order_id: ndr_1.ndr_events.order_id,
                    attempt_no: ndr_1.ndr_events.attempt_no,
                    status: ndr_1.ndr_events.status,
                    reason: ndr_1.ndr_events.reason,
                    created_at: ndr_1.ndr_events.created_at,
                })
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.inArray)(ndr_1.ndr_events.order_id, b2cIds))
                    .orderBy((0, drizzle_orm_1.asc)(ndr_1.ndr_events.created_at))
                : Promise.resolve([]),
            allOrderRefs.length
                ? client_1.db
                    .select({
                    id: codRemittance_1.codRemittances.id,
                    orderId: codRemittance_1.codRemittances.orderId,
                    orderType: codRemittance_1.codRemittances.orderType,
                })
                    .from(codRemittance_1.codRemittances)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.inArray)(codRemittance_1.codRemittances.orderId, allOrderRefs.map((r) => r.orderId))))
                : Promise.resolve([]),
        ]);
        const ndrMap = new Map();
        for (const ndr of ndrRows) {
            const arr = ndrMap.get(ndr.order_id) || [];
            arr.push(ndr);
            ndrMap.set(ndr.order_id, arr);
        }
        const remMap = new Map();
        for (const rem of remRows) {
            remMap.set(`${rem.orderType}:${rem.orderId}`, rem.id);
        }
        const unifiedRows = [
            ...b2cRows.map((o) => ({ ...o, _type: 'b2c' })),
            ...b2bRows.map((o) => ({ ...o, _type: 'b2b' })),
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const headers = fields.map((f) => FIELD_LABELS[f]);
        const rows = unifiedRows.map((order) => {
            const ndrInfo = order._type === 'b2c' ? getNdrAttemptSummary(ndrMap.get(order.id) || []) : '';
            const remittanceId = remMap.get(`${order._type}:${order.id}`) || '';
            const deliveredTime = String(order.order_status || '').toLowerCase() === 'delivered'
                ? stringifyDate(order.updated_at || order.created_at)
                : '';
            const pickupTimeFromDetails = order?.pickup_details?.pickup_time || order?.pickup_details?.pickupTime;
            const shipmentDate = stringifyDate(order.created_at);
            const rowMap = {
                order_number: order.order_number || '',
                order_date: order.order_date || '',
                order_amount: toNumber(order.order_amount).toFixed(2),
                order_type: order.order_type || '',
                buyer_name: order.buyer_name || '',
                buyer_phone: order.buyer_phone || '',
                buyer_email: order.buyer_email || '',
                address: order.address || '',
                city: order.city || '',
                state: order.state || '',
                pincode: order.pincode || '',
                weight: toNumber(order.weight).toFixed(3),
                length: toNumber(order.length).toFixed(2),
                height: toNumber(order.height).toFixed(2),
                breadth: toNumber(order.breadth).toFixed(2),
                order_status: order.order_status || '',
                freight_charges: toNumber(order.freight_charges).toFixed(2),
                discount: toNumber(order.discount).toFixed(2),
                products: formatProducts(order.products),
                shipment_date: shipmentDate,
                awb_number: order.awb_number || '',
                shipment_status: order.order_status || '',
                remittance_id: remittanceId,
                pickup_time: pickupTimeFromDetails || '',
                delivered_time: deliveredTime,
                charged_weight: toNumber(order.charged_weight || order.weight).toFixed(3),
                zone: order.delivery_location || '',
                last_status_updated: stringifyDate(order.updated_at || order.created_at),
                ndr_attempts_info: ndrInfo,
            };
            return fields.map((f) => rowMap[f] ?? '');
        });
        const csv = (0, csv_1.buildCsv)(headers, rows);
        const filename = `custom_report_${fromDate}_to_${toDateStr}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    }
    catch (error) {
        console.error('[exportCustomReportCsvController] Error:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to export report' });
    }
};
exports.exportCustomReportCsvController = exportCustomReportCsvController;
