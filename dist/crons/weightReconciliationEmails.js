"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyWeightReconciliationEmails = sendDailyWeightReconciliationEmails;
exports.sendWeeklyWeightReconciliationEmails = sendWeeklyWeightReconciliationEmails;
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const weightReconciliation_service_1 = require("../models/services/weightReconciliation.service");
const weightReconciliationEmail_service_1 = require("../models/services/weightReconciliationEmail.service");
const schema_1 = require("../schema/schema");
/**
 * Send daily weight reconciliation summary emails
 * Runs every day at 8 AM
 */
async function sendDailyWeightReconciliationEmails() {
    console.log('[Cron] 📧 Sending daily weight reconciliation summaries...');
    try {
        // Get all users with daily summary enabled
        const usersWithDailySummary = await client_1.db
            .select({
            userId: schema_1.users.id,
            userEmail: schema_1.users.email,
            userName: (0, drizzle_orm_1.sql) `'User'`.as('userName'),
            settings: schema_1.weight_reconciliation_settings,
        })
            .from(schema_1.users)
            .innerJoin(schema_1.weight_reconciliation_settings, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.weight_reconciliation_settings.user_id))
            .where((0, drizzle_orm_1.eq)(schema_1.weight_reconciliation_settings.email_daily_summary, true));
        const today = (0, dayjs_1.default)().format('YYYY-MM-DD');
        const startOfDay = (0, dayjs_1.default)().startOf('day').toDate();
        const endOfDay = (0, dayjs_1.default)().endOf('day').toDate();
        for (const user of usersWithDailySummary) {
            try {
                // Get discrepancies for today
                const discrepancies = await client_1.db
                    .select()
                    .from(schema_1.weight_discrepancies)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, user.userId), (0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.detected_at, startOfDay), (0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.detected_at, endOfDay)));
                const pendingCount = discrepancies.filter((d) => d.status === 'pending').length;
                const acceptedCount = discrepancies.filter((d) => d.status === 'accepted').length;
                const disputedCount = discrepancies.filter((d) => d.status === 'disputed').length;
                const totalAdditionalCharges = discrepancies.reduce((sum, d) => sum + Number(d.additional_charge || 0), 0);
                // Only send if there are discrepancies
                if (discrepancies.length > 0) {
                    await (0, weightReconciliationEmail_service_1.sendDailySummaryEmail)({
                        userEmail: user.userEmail || '',
                        userName: user.userName,
                        date: today,
                        totalDiscrepancies: discrepancies.length,
                        pendingCount,
                        acceptedCount,
                        disputedCount,
                        totalAdditionalCharges,
                        discrepancies: discrepancies.slice(0, 20).map((d) => ({
                            orderNumber: d.order_number,
                            weightDifference: Number(d.weight_difference || 0),
                            additionalCharge: Number(d.additional_charge || 0),
                            status: d.status,
                        })),
                    });
                }
            }
            catch (err) {
                console.error(`Failed to send daily summary to ${user.userEmail}:`, err);
            }
        }
        console.log(`[Cron] ✅ Daily weight reconciliation summaries sent to ${usersWithDailySummary.length} users`);
    }
    catch (error) {
        console.error('[Cron] ❌ Error sending daily weight reconciliation summaries:', error);
    }
}
/**
 * Send weekly weight reconciliation report emails
 * Runs every Monday at 9 AM
 */
async function sendWeeklyWeightReconciliationEmails() {
    console.log('[Cron] 📧 Sending weekly weight reconciliation reports...');
    try {
        // Get all users with weekly report enabled
        const usersWithWeeklyReport = await client_1.db
            .select({
            userId: schema_1.users.id,
            userEmail: schema_1.users.email,
            userName: (0, drizzle_orm_1.sql) `'User'`.as('userName'),
            settings: schema_1.weight_reconciliation_settings,
        })
            .from(schema_1.users)
            .innerJoin(schema_1.weight_reconciliation_settings, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.weight_reconciliation_settings.user_id))
            .where((0, drizzle_orm_1.eq)(schema_1.weight_reconciliation_settings.email_weekly_report, true));
        const weekStart = (0, dayjs_1.default)().subtract(7, 'days').startOf('day').toDate();
        const weekEnd = (0, dayjs_1.default)().subtract(1, 'day').endOf('day').toDate();
        const weekStartStr = (0, dayjs_1.default)(weekStart).format('YYYY-MM-DD');
        const weekEndStr = (0, dayjs_1.default)(weekEnd).format('YYYY-MM-DD');
        for (const user of usersWithWeeklyReport) {
            try {
                // Get summary for the week
                const summary = await (0, weightReconciliation_service_1.getWeightReconciliationSummary)(user.userId, weekStart, weekEnd);
                // Get top discrepancies
                const topDiscrepancies = await client_1.db
                    .select()
                    .from(schema_1.weight_discrepancies)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, user.userId), (0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.detected_at, weekStart), (0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.detected_at, weekEnd)))
                    .orderBy((0, drizzle_orm_1.sql) `ABS(${schema_1.weight_discrepancies.weight_difference}) DESC`)
                    .limit(10);
                // Only send if there are discrepancies
                if (summary.summary.totalDiscrepancies > 0) {
                    await (0, weightReconciliationEmail_service_1.sendWeeklyReportEmail)({
                        userEmail: user.userEmail || '',
                        userName: user.userName,
                        weekStart: weekStartStr,
                        weekEnd: weekEndStr,
                        totalDiscrepancies: summary.summary.totalDiscrepancies || 0,
                        pendingCount: summary.summary.pendingCount || 0,
                        acceptedCount: summary.summary.acceptedCount || 0,
                        disputedCount: summary.summary.disputedCount || 0,
                        resolvedCount: summary.summary.resolvedCount || 0,
                        rejectedCount: summary.summary.rejectedCount || 0,
                        totalAdditionalCharges: Number(summary.summary.totalAdditionalCharges || 0),
                        avgWeightDifference: Number(summary.summary.avgWeightDifference || 0),
                        maxWeightDifference: Number(summary.summary.maxWeightDifference || 0),
                        autoAcceptedCount: summary.summary.autoAcceptedCount || 0,
                        courierBreakdown: summary.courierBreakdown.map((c) => ({
                            courierPartner: c.courierPartner || 'N/A',
                            count: c.count || 0,
                            totalCharge: Number(c.totalCharge || 0),
                            avgWeightDiff: Number(c.avgWeightDiff || 0),
                        })),
                        topDiscrepancies: topDiscrepancies.map((d) => ({
                            orderNumber: d.order_number,
                            weightDifference: Number(d.weight_difference || 0),
                            additionalCharge: Number(d.additional_charge || 0),
                            status: d.status,
                            courierPartner: d.courier_partner || 'N/A',
                        })),
                    });
                }
            }
            catch (err) {
                console.error(`Failed to send weekly report to ${user.userEmail}:`, err);
            }
        }
        console.log(`[Cron] ✅ Weekly weight reconciliation reports sent to ${usersWithWeeklyReport.length} users`);
    }
    catch (error) {
        console.error('[Cron] ❌ Error sending weekly weight reconciliation reports:', error);
    }
}
