"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoices = void 0;
const invoice_service_1 = require("../models/services/invoice.service");
const getInvoices = async (req, res) => {
    const userId = req.user.sub;
    try {
        const { page = '1', limit = '10', status, invoiceNumber, dateFrom, dateTo, awb } = req.query;
        const filters = {
            status: status,
            userId: userId,
            invoiceNumber: invoiceNumber,
            dateFrom: dateFrom,
            dateTo: dateTo,
            awb: awb,
        };
        const result = await (0, invoice_service_1.getInvoicesService)({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            filters,
        });
        res.json(result);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
};
exports.getInvoices = getInvoices;
