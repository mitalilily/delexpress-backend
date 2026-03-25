"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminRtoKpis = exports.exportAdminRto = exports.getAdminRtoEvents = exports.getMyRtoEvents = void 0;
const rto_service_1 = require("../models/services/rto.service");
const getMyRtoEvents = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { orderId, page, limit, search, fromDate, toDate } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, rto_service_1.listRtoEvents)(userId, orderId, {
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
exports.getMyRtoEvents = getMyRtoEvents;
const getAdminRtoEvents = async (req, res) => {
    try {
        const { orderId, page, limit, search, fromDate, toDate } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, rto_service_1.listRtoEventsAdmin)(orderId, {
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
exports.getAdminRtoEvents = getAdminRtoEvents;
const exportAdminRto = async (req, res) => {
    try {
        const { search, fromDate, toDate } = req.query;
        const csv = await (0, rto_service_1.adminRtoExport)({ search: search || '', fromDate, toDate });
        const ts = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="rto_export_${ts}.csv"`);
        res.status(200).send(csv);
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.exportAdminRto = exportAdminRto;
const getAdminRtoKpis = async (req, res) => {
    try {
        const { search, fromDate, toDate } = req.query;
        const data = await (0, rto_service_1.adminRtoKpis)({ search: search || '', fromDate, toDate });
        res.json({ success: true, data });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminRtoKpis = getAdminRtoKpis;
