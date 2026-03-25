"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveDashboardPreferencesController = exports.getDashboardPreferencesController = void 0;
const dashboardPreferences_service_1 = require("../models/services/dashboardPreferences.service");
const getDashboardPreferencesController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const preferences = await (0, dashboardPreferences_service_1.getDashboardPreferences)(userId);
        return res.status(200).json({ success: true, data: preferences });
    }
    catch (error) {
        console.error('Error fetching dashboard preferences:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.getDashboardPreferencesController = getDashboardPreferencesController;
const saveDashboardPreferencesController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const preferences = await (0, dashboardPreferences_service_1.saveDashboardPreferences)(userId, req.body);
        return res.status(200).json({ success: true, data: preferences });
    }
    catch (error) {
        console.error('Error saving dashboard preferences:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.saveDashboardPreferencesController = saveDashboardPreferencesController;
