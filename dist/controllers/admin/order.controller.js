"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.regenerateOrderDocumentsControllerAdmin = exports.exportOrdersControllerAdmin = exports.getAllOrdersControllerAdmin = void 0;
const adminOrders_service_1 = require("../../models/services/adminOrders.service");
const csv_1 = require("../../utils/csv");
const getAllOrdersControllerAdmin = async (req, res) => {
    try {
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            userId: req.query.userId,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        const { orders, totalCount, totalPages } = await (0, adminOrders_service_1.getAllOrdersServiceAdmin)({
            page,
            limit,
            filters,
        });
        res.status(200).json({ success: true, orders, totalCount, totalPages });
    }
    catch (error) {
        console.error('Error fetching all orders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllOrdersControllerAdmin = getAllOrdersControllerAdmin;
const exportOrdersControllerAdmin = async (req, res) => {
    try {
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            userId: req.query.userId,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        // Fetch all orders without pagination for export
        const { orders } = await (0, adminOrders_service_1.getAllOrdersServiceAdmin)({
            page: 1,
            limit: 100000, // Large limit to get all orders
            filters,
        });
        // Generate CSV
        const headers = [
            'Order ID',
            'AWB Number',
            'Customer Name',
            'Customer Phone',
            'Customer Email',
            'Status',
            'Order Type',
            'Amount',
            'Courier Partner',
            'Order Date',
            'City',
            'State',
            'Pincode',
            'Address',
        ];
        const rows = orders.map((order) => [
            order.order_id,
            order.awb_number,
            order.buyer_name,
            order.buyer_phone,
            order.buyer_email,
            order.order_status,
            order.order_type,
            order.order_amount,
            order.courier_partner,
            order.order_date,
            order.city,
            order.state,
            order.pincode,
            order.address,
        ]);
        const csv = (0, csv_1.buildCsv)(headers, rows);
        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=orders_export_${new Date().toISOString().split('T')[0]}.csv`);
        res.status(200).send(csv);
    }
    catch (error) {
        console.error('Error exporting orders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.exportOrdersControllerAdmin = exportOrdersControllerAdmin;
const regenerateOrderDocumentsControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const regenerateLabel = typeof req.body?.regenerateLabel === 'boolean' ? req.body.regenerateLabel : true;
        const regenerateInvoice = typeof req.body?.regenerateInvoice === 'boolean' ? req.body.regenerateInvoice : true;
        const result = await (0, adminOrders_service_1.regenerateOrderDocumentsServiceAdmin)({
            orderId,
            regenerateLabel,
            regenerateInvoice,
        });
        return res.status(200).json({
            success: true,
            message: 'Order documents regenerated successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error regenerating order documents:', error?.message || error);
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to regenerate order documents',
        });
    }
};
exports.regenerateOrderDocumentsControllerAdmin = regenerateOrderDocumentsControllerAdmin;
