"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRtoEventsController = void 0;
const rto_service_1 = require("../../models/services/rto.service");
/**
 * Get RTO (Return to Origin) events
 * GET /api/v1/rto
 */
const getRtoEventsController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId, page, limit, search, fromDate, toDate } = req.query;
        const p = Math.max(Number(page) || 1, 1);
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, rto_service_1.listRtoEvents)(userId, orderId, {
            page: p,
            limit: l,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
        });
        res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                page: p,
                limit: l,
                total: totalCount,
                totalPages: Math.ceil(totalCount / l),
            },
        });
    }
    catch (error) {
        console.error('Error fetching RTO events via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch RTO events',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getRtoEventsController = getRtoEventsController;
