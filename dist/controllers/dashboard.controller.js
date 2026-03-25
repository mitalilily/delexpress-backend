"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMerchantDashboardStatsController = exports.getDashboardCourierDistribution = exports.getDashboardTopDestinations = exports.getDashboardInvoiceStatus = exports.getDashboardPendingActions = exports.getHomePickups = void 0;
const dashboard_service_1 = require("../models/services/dashboard.service");
const getHomePickups = async (req, res) => {
    try {
        const userId = req.user?.sub; // assume JWT middleware sets this
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const pickups = await (0, dashboard_service_1.getIncomingPickups)(userId);
        return res.json({ success: true, pickups });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Failed to fetch pickups' });
    }
};
exports.getHomePickups = getHomePickups;
const getDashboardPendingActions = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const pendingActions = await (0, dashboard_service_1.getPendingActions)(userId);
        return res.json({ success: true, ...pendingActions });
    }
    catch (error) {
        console.error('Error fetching pending actions:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch pending actions' });
    }
};
exports.getDashboardPendingActions = getDashboardPendingActions;
const getDashboardInvoiceStatus = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const invoiceStatus = await (0, dashboard_service_1.getInvoiceStatus)(userId);
        return res.json({ success: true, status: invoiceStatus });
    }
    catch (error) {
        console.error('Error fetching invoice status:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch invoice status' });
    }
};
exports.getDashboardInvoiceStatus = getDashboardInvoiceStatus;
const getDashboardTopDestinations = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const limit = parseInt(req.query.limit || '10');
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const destinations = await (0, dashboard_service_1.getTopDestinations)(userId, limit);
        return res.json({ success: true, destinations });
    }
    catch (error) {
        console.error('Error fetching top destinations:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch top destinations' });
    }
};
exports.getDashboardTopDestinations = getDashboardTopDestinations;
const getDashboardCourierDistribution = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const distribution = await (0, dashboard_service_1.getCourierDistribution)(userId);
        return res.json({ success: true, distribution });
    }
    catch (error) {
        console.error('Error fetching courier distribution:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch courier distribution' });
    }
};
exports.getDashboardCourierDistribution = getDashboardCourierDistribution;
const getMerchantDashboardStatsController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const stats = await (0, dashboard_service_1.getMerchantDashboardStats)(userId);
        return res.json(stats);
    }
    catch (error) {
        console.error('Error fetching merchant dashboard stats:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch merchant dashboard stats' });
    }
};
exports.getMerchantDashboardStatsController = getMerchantDashboardStatsController;
