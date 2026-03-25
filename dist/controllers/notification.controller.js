"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotificationController = createNotificationController;
exports.getMyNotifications = getMyNotifications;
exports.markReadController = markReadController;
exports.markAllReadController = markAllReadController;
const notifications_service_1 = require("../models/services/notifications.service");
async function createNotificationController(req, res) {
    const { title, message, type, sendEmail, email, targetRole } = req.body;
    const userId = req.user.sub;
    const notification = await (0, notifications_service_1.createNotificationService)({
        userId,
        title,
        message,
        targetRole,
        type,
        sendEmail,
        email,
    });
    res.json({ success: !!notification, notification });
}
async function getMyNotifications(req, res) {
    try {
        const userId = req.user.sub;
        const rows = await (0, notifications_service_1.getNotificationsForUser)(userId);
        res.json({ notifications: rows });
    }
    catch {
        res.json({ notifications: [] });
    }
}
async function markReadController(req, res) {
    const userId = req.user.sub;
    const { id } = req.params;
    const success = await (0, notifications_service_1.markNotificationAsRead)(userId, id);
    res.json({ success });
}
async function markAllReadController(req, res) {
    const userId = req.user.sub;
    const result = await (0, notifications_service_1.markAllNotificationsAsRead)(userId);
    res.json({ success: true, ...result });
}
