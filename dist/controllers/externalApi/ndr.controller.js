"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNdrTimelineController = exports.getNdrEventsController = void 0;
const ndr_service_1 = require("../../models/services/ndr.service");
/**
 * Get NDR events
 * GET /api/v1/ndr
 */
const getNdrEventsController = async (req, res) => {
    try {
        const userId = req.userId;
        const { orderId, page, limit, search, fromDate, toDate } = req.query;
        const p = Math.max(Number(page) || 1, 1);
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, ndr_service_1.listNdrEvents)(userId, orderId, {
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
        console.error('Error fetching NDR events via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch NDR events',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getNdrEventsController = getNdrEventsController;
/**
 * Get NDR timeline for an order
 * GET /api/v1/ndr/timeline
 */
const getNdrTimelineController = async (req, res) => {
    try {
        const { awb, orderId } = req.query;
        if (!awb && !orderId) {
            return res.status(400).json({
                success: false,
                error: 'Missing parameters',
                message: 'Provide either awb or orderId',
            });
        }
        const data = await (0, ndr_service_1.getNdrTimeline)({ awb, orderId });
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error('Error fetching NDR timeline via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch NDR timeline',
            message: error.message || 'Internal server error',
        });
    }
};
exports.getNdrTimelineController = getNdrTimelineController;
