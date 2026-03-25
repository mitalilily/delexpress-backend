"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/notificationRoutes.ts
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Create a notification
router.post('/', requireAuth_1.requireAuth, notification_controller_1.createNotificationController);
// Get all notifications for logged-in user
router.get('/', requireAuth_1.requireAuth, notification_controller_1.getMyNotifications);
// Mark all notifications as read
router.patch('/read-all', requireAuth_1.requireAuth, notification_controller_1.markAllReadController);
// Mark a specific notification as read
router.patch('/:id/read', requireAuth_1.requireAuth, notification_controller_1.markReadController);
exports.default = router;
