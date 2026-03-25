"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryDeveloperManifestController = exports.updateDeveloperIssueStateController = exports.getDeveloperErrorLogsController = void 0;
const adminDeveloper_service_1 = require("../../models/services/adminDeveloper.service");
const getDeveloperErrorLogsController = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const filters = {
            source: req.query.source,
            status: req.query.status,
            priority: req.query.priority,
            search: req.query.search,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            courier: req.query.courier,
            merchant: req.query.merchant,
            issueOwner: req.query.issueOwner,
            actionRequired: req.query.actionRequired,
            actionable: req.query.actionable,
            rootCause: req.query.rootCause,
        };
        const result = await (0, adminDeveloper_service_1.getDeveloperErrorLogsService)({
            page,
            limit,
            filters,
        });
        return res.status(200).json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        console.error('Error fetching developer logs:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch developer logs',
        });
    }
};
exports.getDeveloperErrorLogsController = getDeveloperErrorLogsController;
const updateDeveloperIssueStateController = async (req, res) => {
    try {
        const adminUserId = req.user?.sub;
        const issueKey = decodeURIComponent(String(req.params.issueKey || ''));
        const result = await (0, adminDeveloper_service_1.updateDeveloperIssueStateService)({
            issueKey,
            adminUserId,
            status: req.body?.status,
            priority: req.body?.priority,
            assignToMe: req.body?.assignToMe === true,
            clearOwner: req.body?.clearOwner === true,
            markAlertSeen: req.body?.markAlertSeen === true,
        });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error updating developer issue:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to update developer issue',
        });
    }
};
exports.updateDeveloperIssueStateController = updateDeveloperIssueStateController;
const retryDeveloperManifestController = async (req, res) => {
    try {
        const adminUserId = req.user?.sub;
        const orderId = String(req.body?.orderId || '').trim();
        const issueKey = req.body?.issueKey ? String(req.body.issueKey) : undefined;
        const result = await (0, adminDeveloper_service_1.retryFailedManifestServiceForAdmin)({ orderId, issueKey, adminUserId });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error retrying manifest from developer tab:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to retry manifest',
        });
    }
};
exports.retryDeveloperManifestController = retryDeveloperManifestController;
