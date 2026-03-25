"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalSearch = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const invoices_1 = require("../schema/invoices");
const ndr_1 = require("../schema/ndr");
const rto_1 = require("../schema/rto");
const weightDiscrepancies_1 = require("../schema/weightDiscrepancies");
const globalSearch = async (userId, query, limit = 10) => {
    const searchTerm = `%${query.trim()}%`;
    const results = [];
    // Search in B2C Orders
    const b2cOrders = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        buyer_name: b2cOrders_1.b2c_orders.buyer_name,
        city: b2cOrders_1.b2c_orders.city,
        state: b2cOrders_1.b2c_orders.state,
        order_status: b2cOrders_1.b2c_orders.order_status,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.order_number, searchTerm), (0, drizzle_orm_1.sql) `COALESCE(CAST(${b2cOrders_1.b2c_orders.awb_number} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.sql) `COALESCE(CAST(${b2cOrders_1.b2c_orders.order_id} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.buyer_name, searchTerm))))
        .limit(limit);
    for (const order of b2cOrders) {
        results.push({
            type: 'order',
            id: order.id,
            title: order.order_number,
            subtitle: order.awb_number
                ? `${order.buyer_name} • ${order.city}, ${order.state} • ${order.awb_number}`
                : `${order.buyer_name} • ${order.city}, ${order.state}`,
            link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
            metadata: {
                awb: order.awb_number,
                status: order.order_status,
                type: 'b2c',
            },
        });
    }
    // Search in B2B Orders
    const b2bOrders = await client_1.db
        .select({
        id: b2bOrders_1.b2b_orders.id,
        order_number: b2bOrders_1.b2b_orders.order_number,
        awb_number: b2bOrders_1.b2b_orders.awb_number,
        buyer_name: b2bOrders_1.b2b_orders.buyer_name,
        city: b2bOrders_1.b2b_orders.city,
        state: b2bOrders_1.b2b_orders.state,
        order_status: b2bOrders_1.b2b_orders.order_status,
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(b2bOrders_1.b2b_orders.order_number, searchTerm), (0, drizzle_orm_1.sql) `COALESCE(CAST(${b2bOrders_1.b2b_orders.awb_number} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.sql) `COALESCE(CAST(${b2bOrders_1.b2b_orders.order_id} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.ilike)(b2bOrders_1.b2b_orders.buyer_name, searchTerm))))
        .limit(limit);
    for (const order of b2bOrders) {
        results.push({
            type: 'order',
            id: order.id,
            title: order.order_number,
            subtitle: order.awb_number
                ? `${order.buyer_name} • ${order.city}, ${order.state} • ${order.awb_number}`
                : `${order.buyer_name} • ${order.city}, ${order.state}`,
            link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
            metadata: {
                awb: order.awb_number,
                status: order.order_status,
                type: 'b2b',
            },
        });
    }
    // Search in Invoices
    const invoiceResults = await client_1.db
        .select({
        id: invoices_1.invoices.id,
        invoice_number: invoices_1.invoices.invoiceNumber,
        status: invoices_1.invoices.status,
        net_payable_amount: invoices_1.invoices.netPayableAmount,
    })
        .from(invoices_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(invoices_1.invoices.userId, userId), (0, drizzle_orm_1.ilike)(invoices_1.invoices.invoiceNumber, searchTerm)))
        .limit(5);
    for (const invoice of invoiceResults) {
        results.push({
            type: 'invoice',
            id: String(invoice.id),
            title: invoice.invoice_number,
            subtitle: `Status: ${invoice.status} • Amount: ₹${Number(invoice.net_payable_amount).toLocaleString('en-IN')}`,
            link: `/billing/invoice_management?search=${encodeURIComponent(invoice.invoice_number)}`,
            metadata: {
                status: invoice.status,
                amount: invoice.net_payable_amount,
            },
        });
    }
    // Search in NDR Events (by AWB or order number)
    const ndrResults = await client_1.db
        .select({
        id: ndr_1.ndr_events.id,
        order_id: ndr_1.ndr_events.order_id,
        awb_number: ndr_1.ndr_events.awb_number,
        status: ndr_1.ndr_events.status,
        reason: ndr_1.ndr_events.reason,
    })
        .from(ndr_1.ndr_events)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `COALESCE(CAST(${ndr_1.ndr_events.awb_number} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.sql) `COALESCE(CAST(${ndr_1.ndr_events.order_id} AS TEXT), '') ILIKE ${searchTerm}`)))
        .limit(5);
    for (const ndr of ndrResults) {
        results.push({
            type: 'ndr',
            id: ndr.id,
            title: ndr.awb_number || `NDR-${ndr.id.slice(0, 8)}`,
            subtitle: `NDR • ${ndr.status} • ${ndr.reason || 'No reason'}`,
            link: `/ops/ndr?search=${encodeURIComponent(ndr.awb_number || ndr.order_id)}`,
            metadata: {
                status: ndr.status,
                reason: ndr.reason,
            },
        });
    }
    // Search in RTO Events (by AWB or order number)
    const rtoResults = await client_1.db
        .select({
        id: rto_1.rto_events.id,
        order_id: rto_1.rto_events.order_id,
        awb_number: rto_1.rto_events.awb_number,
        status: rto_1.rto_events.status,
        reason: rto_1.rto_events.reason,
    })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `COALESCE(CAST(${rto_1.rto_events.awb_number} AS TEXT), '') ILIKE ${searchTerm}`, (0, drizzle_orm_1.sql) `COALESCE(CAST(${rto_1.rto_events.order_id} AS TEXT), '') ILIKE ${searchTerm}`)))
        .limit(5);
    for (const rto of rtoResults) {
        results.push({
            type: 'rto',
            id: rto.id,
            title: rto.awb_number || `RTO-${rto.id.slice(0, 8)}`,
            subtitle: `RTO • ${rto.status} • ${rto.reason || 'No reason'}`,
            link: `/ops/rto?search=${encodeURIComponent(rto.awb_number || rto.order_id)}`,
            metadata: {
                status: rto.status,
                reason: rto.reason,
            },
        });
    }
    // Search in Weight Discrepancies (by AWB or order number)
    const weightResults = await client_1.db
        .select({
        id: weightDiscrepancies_1.weight_discrepancies.id,
        order_number: weightDiscrepancies_1.weight_discrepancies.order_number,
        awb_number: weightDiscrepancies_1.weight_discrepancies.awb_number,
        status: weightDiscrepancies_1.weight_discrepancies.status,
    })
        .from(weightDiscrepancies_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(weightDiscrepancies_1.weight_discrepancies.order_number, searchTerm), (0, drizzle_orm_1.sql) `COALESCE(CAST(${weightDiscrepancies_1.weight_discrepancies.awb_number} AS TEXT), '') ILIKE ${searchTerm}`)))
        .limit(5);
    for (const weight of weightResults) {
        results.push({
            type: 'weight_discrepancy',
            id: weight.id,
            title: weight.order_number,
            subtitle: weight.awb_number
                ? `Weight Discrepancy • ${weight.status} • AWB: ${weight.awb_number}`
                : `Weight Discrepancy • ${weight.status}`,
            link: `/reconciliation/weight?search=${encodeURIComponent(weight.order_number)}`,
            metadata: {
                status: weight.status,
                awb: weight.awb_number,
            },
        });
    }
    // Sort by relevance (exact matches first, then partial matches)
    return results
        .sort((a, b) => {
        const aExact = a.title.toLowerCase().includes(query.toLowerCase());
        const bExact = b.title.toLowerCase().includes(query.toLowerCase());
        if (aExact && !bExact)
            return -1;
        if (!aExact && bExact)
            return 1;
        return 0;
    })
        .slice(0, limit);
};
exports.globalSearch = globalSearch;
