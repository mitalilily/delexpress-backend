"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotificationService = createNotificationService;
exports.getNotificationsForUser = getNotificationsForUser;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const drizzle_orm_1 = require("drizzle-orm");
const socketServer_1 = require("../../config/socketServer");
const client_1 = require("../client");
const notifications_1 = require("../schema/notifications");
const users_1 = require("../schema/users");
const sendGridApiKey = process.env.TWILLIO_SENDGRID_API_KEY;
if (sendGridApiKey) {
    mail_1.default.setApiKey(sendGridApiKey);
}
else {
    console.warn('[SendGrid] TWILLIO_SENDGRID_API_KEY is not configured. Email notifications are disabled.');
}
async function createNotificationService(params) {
    const { targetRole, userId, title, message } = params;
    if (targetRole === 'admin') {
        const adminUsers = await client_1.db.query.users.findMany({
            where: (0, drizzle_orm_1.eq)(users_1.users.role, 'admin'),
            columns: { id: true, email: true },
        });
        if (adminUsers.length === 0)
            return null;
        const notificationsData = adminUsers.map((admin) => ({
            targetRole,
            userId: admin.id,
            title,
            message,
        }));
        const newNotifications = await client_1.db.insert(notifications_1.notifications).values(notificationsData).returning();
        newNotifications.forEach((n) => {
            if (n?.userId)
                (0, socketServer_1.sendNotification)(n.userId, n);
        });
        return newNotifications;
    }
    const [newNotification] = await client_1.db
        .insert(notifications_1.notifications)
        .values({
        targetRole,
        userId: userId || null,
        title,
        message,
    })
        .returning();
    if (userId && targetRole === 'user') {
        (0, socketServer_1.sendNotification)(userId, newNotification);
    }
    return newNotification;
}
async function getNotificationsForUser(userId) {
    const rows = await client_1.db
        .select()
        .from(notifications_1.notifications)
        .where((0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(notifications_1.notifications.createdAt));
    return rows;
}
async function markNotificationAsRead(userId, notificationId) {
    const [updated] = await client_1.db
        .update(notifications_1.notifications)
        .set({ read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notifications_1.notifications.id, notificationId), (0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId)))
        .returning();
    return updated;
}
async function markAllNotificationsAsRead(userId) {
    const updated = await client_1.db
        .update(notifications_1.notifications)
        .set({ read: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notifications_1.notifications.userId, userId), (0, drizzle_orm_1.eq)(notifications_1.notifications.read, false)))
        .returning({ id: notifications_1.notifications.id });
    return {
        count: updated.length,
    };
}
async function sendEmailNotification(to, subject, message) {
    if (!sendGridApiKey) {
        console.warn('[SendGrid] Skipping email notification because API key is not configured.');
        return;
    }
    const msg = {
        to,
        from: process.env.EMAIL_FROM,
        subject,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">${subject}</h2>
        <p style="font-size: 16px; color: #555;">${message}</p>
        <p style="font-size: 14px; color: #888; margin-top: 32px;">- The DelExpress Team</p>
      </div>
    `,
    };
    try {
        await mail_1.default.send(msg);
    }
    catch (error) {
        console.error('Email sending failed:', error);
    }
}
