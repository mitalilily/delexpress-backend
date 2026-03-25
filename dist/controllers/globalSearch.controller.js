"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalSearchController = void 0;
const globalSearch_service_1 = require("../models/services/globalSearch.service");
const globalSearchController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const query = req.query.q || req.query.query || '';
        const limit = parseInt(req.query.limit || '10', 10);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters',
                results: [],
            });
        }
        const results = await (0, globalSearch_service_1.globalSearch)(userId, query.trim(), limit);
        return res.json({
            success: true,
            results,
            query: query.trim(),
            count: results.length,
        });
    }
    catch (error) {
        console.error('Error in global search:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to perform search',
            results: [],
        });
    }
};
exports.globalSearchController = globalSearchController;
