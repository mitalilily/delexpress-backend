"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const razorpay_1 = require("../utils/razorpay");
const invoiceGenerator_1 = require("./invoiceGenerator");
const processPendingWebhooks_1 = require("./processPendingWebhooks");
const reconcileWalletTopups_1 = require("./reconcileWalletTopups");
const seedHolidays_1 = require("./seedHolidays");
const weightReconciliationEmails_1 = require("./weightReconciliationEmails");
const ekartTracking_1 = require("./ekartTracking");
if (razorpay_1.isRazorpayConfigured) {
    node_cron_1.default.schedule('*/20 * * * *', async () => {
        console.log('[Cron] Wallet reconciliation kicking off');
        try {
            await (0, reconcileWalletTopups_1.reconcileWalletTopups)();
        }
        catch (err) {
            console.error('[Cron] Wallet reconciliation failed:', err);
        }
    });
}
else {
    console.warn('[Cron] Wallet reconciliation skipped because Razorpay credentials are missing.');
}
node_cron_1.default.schedule('*/1 * * * *', () => {
    (0, processPendingWebhooks_1.processPendingWebhooks)().catch((err) => console.error('Error in cron webhook processor', err));
});
node_cron_1.default.schedule('0 2 * * *', () => (0, invoiceGenerator_1.generateAutoBillingInvoices)());
node_cron_1.default.schedule('0 8 * * *', async () => {
    console.log('[Cron] Daily weight reconciliation emails starting...');
    try {
        await (0, weightReconciliationEmails_1.sendDailyWeightReconciliationEmails)();
    }
    catch (err) {
        console.error('[Cron] Daily weight reconciliation emails failed:', err);
    }
});
node_cron_1.default.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Weekly weight reconciliation reports starting...');
    try {
        await (0, weightReconciliationEmails_1.sendWeeklyWeightReconciliationEmails)();
    }
    catch (err) {
        console.error('[Cron] Weekly weight reconciliation reports failed:', err);
    }
});
node_cron_1.default.schedule('*/15 * * * *', async () => {
    console.log('[Cron] Ekart tracking poll');
    try {
        await (0, ekartTracking_1.pollEkartTracking)();
    }
    catch (err) {
        console.error('[Cron] Ekart tracking poll failed:', err);
    }
});
node_cron_1.default.schedule('0 0 1 1 *', () => {
    console.log('[Cron] Holiday seeding cron triggered (January 1st)');
    (0, seedHolidays_1.seedHolidaysCron)().catch((err) => console.error('Error in holiday seeding cron', err));
});
